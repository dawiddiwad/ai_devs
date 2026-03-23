import OpenAI from 'openai'
import { z } from 'zod/v4'
import { config } from '../config'
import { logger } from '../logger'
import { getNormalRecords } from './sensor-anomalies'
import { KEYWORD_DISCOVERY_PROMPT, CLASSIFICATION_PROMPT } from '../prompts'

const NGRAM_CANDIDATES_COUNT = 150
const POSITIVE_NGRAM_FILTER_COUNT = NGRAM_CANDIDATES_COUNT
const BATCH_SIZE = 1000
const MAX_NOTES_FOR_LLM = 8000
const NGRAM_SIZE = 2

const PositiveNgramsSchema = z.object({
	positive_phrases: z.array(z.string()),
})

const ClassificationSchema = z.object({
	anomaly_note_ids: z.array(z.number()),
})

interface NoteEntry {
	note_id: number
	text: string
	file_id: string
}

function tokenize(text: string): string[] {
	return text
		.toLowerCase()
		.replace(/[^a-zA-Z0-9\s]/g, '')
		.split(/\s+/)
		.filter((w) => w.length > 0)
}

function extractNgrams(words: string[], n: number): string[] {
	const ngrams: string[] = []
	for (let i = 0; i <= words.length - n; i++) {
		ngrams.push(words.slice(i, i + n).join(' '))
	}
	return ngrams
}

async function callLLM(openai: OpenAI, systemPrompt: string, userContent: string): Promise<string> {
	logger.api('info', 'Sending request to OpenAI', {
		systemPromptLength: systemPrompt.length,
		userContentLength: userContent.length,
	})

	const response = await openai.chat.completions.create({
		model: config.openaiModel,
		temperature: config.openaiTemperature,
		response_format: { type: 'json_object' },
		messages: [
			{ role: 'system', content: systemPrompt },
			{ role: 'user', content: userContent },
		],
	})

	const content = response.choices[0]?.message?.content || ''
	logger.api('info', 'Received OpenAI response', { contentLength: content.length })
	return content
}

export async function operatorAnomalies(): Promise<{
	anomaly_ids: string[]
	anomaly_count: number
	notes_analyzed: number
	notes_filtered_out: number
	positive_keywords: string[]
	total_files_analyzed: number
}> {
	const normalRecords = getNormalRecords()
	if (normalRecords.length === 0) {
		logger.tool('error', 'No normal records available. Run sensor_anomalies first.')
		return {
			anomaly_ids: [],
			anomaly_count: 0,
			notes_analyzed: 0,
			notes_filtered_out: 0,
			positive_keywords: [],
			total_files_analyzed: 0,
		}
	}

	const openai = new OpenAI({
		apiKey: config.openaiApiKey,
		...(config.openaiBaseUrl ? { baseURL: config.openaiBaseUrl } : {}),
	})

	logger.tool('info', 'Phase 1: Discovering positive phrases from note corpus via bigram analysis')

	const ngramFrequency: Record<string, number> = {}
	const noteNgrams: Map<number, string[]> = new Map()

	for (let i = 0; i < normalRecords.length; i++) {
		const words = tokenize(normalRecords[i].data.operator_notes)
		const ngrams = extractNgrams(words, NGRAM_SIZE)
		noteNgrams.set(i, ngrams)
		for (const ngram of ngrams) {
			ngramFrequency[ngram] = (ngramFrequency[ngram] || 0) + 1
		}
	}

	const topNgrams = Object.entries(ngramFrequency)
		.sort((a, b) => b[1] - a[1])
		.slice(0, NGRAM_CANDIDATES_COUNT)
		.map(([ngram]) => ngram)

	logger.tool('info', 'Top frequent bigrams extracted', { count: topNgrams.length, sample: topNgrams.slice(0, 10) })

	const ngramResponse = await callLLM(openai, KEYWORD_DISCOVERY_PROMPT, `Phrases: ${JSON.stringify(topNgrams)}`)

	const ngramParsed = PositiveNgramsSchema.parse(JSON.parse(ngramResponse))
	const allPositivePhrases = ngramParsed.positive_phrases.map((p) => p.toLowerCase())

	const positivePhrases = allPositivePhrases
		.filter((p) => topNgrams.includes(p))
		.slice(0, POSITIVE_NGRAM_FILTER_COUNT)

	logger.tool('info', 'Positive phrases selected for filtering', { positivePhrases })

	logger.tool('info', 'Phase 2: Filtering and classifying operator notes')

	const notesForLLM: NoteEntry[] = []
	let filteredOutCount = 0

	for (let i = 0; i < normalRecords.length; i++) {
		const record = normalRecords[i]
		const ngrams = noteNgrams.get(i) || extractNgrams(tokenize(record.data.operator_notes), NGRAM_SIZE)
		const hasPositivePhrase = positivePhrases.some((pp) => ngrams.includes(pp))

		if (hasPositivePhrase) {
			filteredOutCount++
		} else {
			notesForLLM.push({
				note_id: notesForLLM.length + 1,
				text: record.data.operator_notes,
				file_id: record.fileId,
			})
		}
	}

	logger.tool('info', 'Pre-filtering complete', {
		notes_for_llm: notesForLLM.length,
		filtered_out: filteredOutCount,
	})

	if (notesForLLM.length > MAX_NOTES_FOR_LLM) {
		logger.tool('error', 'Too many notes for LLM classification, exiting', { count: notesForLLM.length })
		process.exit(1)
	}

	const anomalyFileIds: string[] = []

	for (let batchStart = 0; batchStart < notesForLLM.length; batchStart += BATCH_SIZE) {
		const batch = notesForLLM.slice(batchStart, batchStart + BATCH_SIZE)
		logger.tool('info', 'Classifying batch', { batchStart, batchSize: batch.length })

		const batchPayload = batch.map((n) => ({ note_id: n.note_id, text: n.text }))

		const classificationResponse = await callLLM(openai, CLASSIFICATION_PROMPT, JSON.stringify(batchPayload))

		const classificationParsed = ClassificationSchema.parse(JSON.parse(classificationResponse))

		for (const noteId of classificationParsed.anomaly_note_ids) {
			const entry = notesForLLM.find((n) => n.note_id === noteId)
			if (entry) {
				anomalyFileIds.push(entry.file_id)
			}
		}
	}

	logger.tool('info', 'Operator anomaly analysis complete', {
		anomaly_count: anomalyFileIds.length,
		notes_analyzed: notesForLLM.length,
		notes_filtered_out: filteredOutCount,
	})

	return {
		anomaly_ids: anomalyFileIds,
		anomaly_count: anomalyFileIds.length,
		notes_analyzed: notesForLLM.length,
		notes_filtered_out: filteredOutCount,
		positive_keywords: positivePhrases,
		total_files_analyzed: normalRecords.length,
	}
}
