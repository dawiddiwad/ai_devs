import axios from 'axios'
import { z } from 'zod'
import type { ChatCompletionTool } from 'openai/resources/chat/completions'
import { logger } from './logger'
import { compressLogs } from './compressor'

const FLAG_PATTERN = /\{FLG:[^}]+\}/

let cachedLogLines: string[] = []
let searchBuffer: string[] = []
let cachedCompressedLogs: string | null = null

const SearchLogsInput = z.object({
	query: z.string().describe('Regex pattern to search for in the log file'),
})

const CompressLogsInput = z.object({
	instructions: z
		.string()
		.describe(
			'Instructions for the compressor: what to focus on, what subsystems are important, any technician feedback to address'
		),
	mergeWithPrevious: z
		.boolean()
		.optional()
		.default(false)
		.describe('If true, the compressor will receive the previous compressed output and merge new findings into it'),
})

export const toolDefinitions: ChatCompletionTool[] = [
	{
		type: 'function',
		function: {
			name: 'fetch_logs',
			description:
				'Downloads the full log file and pre-filters to WARN/ERRO/CRIT lines only. Must be called once before any search operations. Returns metadata only (raw line count, filtered line count, token count, timestamp range).',
			parameters: {
				type: 'object',
				properties: {},
				required: [],
			},
		},
	},
	{
		type: 'function',
		function: {
			name: 'search_logs',
			description:
				'Searches the cached (already WARN/ERRO/CRIT filtered) log file using a regex pattern. Matching lines are added to an internal buffer for compression. Returns only the match count (not the log content). Do NOT search by severity level — search by subsystem or component instead.',
			parameters: {
				type: 'object',
				properties: {
					query: {
						type: 'string',
						description:
							"Regex pattern to search by subsystem/component. Examples: 'ECCS|reactor|core', 'pump|cooling|temperature', 'emergency|shutdown|scram', 'PWR\\\\d+'",
					},
				},
				required: ['query'],
			},
		},
	},
	{
		type: 'function',
		function: {
			name: 'compress_logs',
			description:
				'Compresses the search buffer into a concise log summary using a specialized small model. The compressed result is cached and will be automatically used when submitting. Returns only metadata (line count, token count, whether within 1500 token limit). You never see the raw logs — only the compression stats.',
			parameters: {
				type: 'object',
				properties: {
					instructions: {
						type: 'string',
						description:
							'Instructions for the compressor: what to focus on, what subsystems are important, any technician feedback to address',
					},
					mergeWithPrevious: {
						type: 'boolean',
						description:
							'If true, the compressor will receive the previous compressed output and merge new findings into it. Use this after adding new search results to refine the existing output.',
					},
				},
				required: ['instructions'],
			},
		},
	},
	{
		type: 'function',
		function: {
			name: 'clear_search_buffer',
			description:
				'Clears the search buffer. Use this before starting a fresh set of searches if you want to replace the buffer contents entirely.',
			parameters: {
				type: 'object',
				properties: {},
				required: [],
			},
		},
	},
	{
		type: 'function',
		function: {
			name: 'submit_answer',
			description:
				'Submits the latest compressed logs to Centrala for verification. The cached compressed output is sent automatically — you do not need to provide the logs. Returns technician feedback or the flag.',
			parameters: {
				type: 'object',
				properties: {},
				required: [],
			},
		},
	},
]

async function fetchLogs(): Promise<string> {
	const apiKey = process.env.AI_DEVS_API_KEY
	const url = `https://***hub_endpoint***/data/${apiKey}/failure.log`

	logger.api('info', 'Fetching log file', { url: url.replace(apiKey!, '***') })

	const response = await axios.get<string>(url, { responseType: 'text' })
	const text = response.data
	const allLines = text.split('\n').filter((line) => line.trim() !== '')

	const severityFilter = /\[(WARN|ERRO|CRIT)\]/i
	cachedLogLines = allLines.filter((line) => severityFilter.test(line))

	const approximateTokens = Math.ceil(cachedLogLines.join('\n').length / 3.5)
	const firstTimestamp = cachedLogLines[0]?.match(/\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2})\]/)?.[1] || 'unknown'
	const lastTimestamp =
		cachedLogLines[cachedLogLines.length - 1]?.match(/\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2})\]/)?.[1] || 'unknown'

	logger.tool('info', 'Logs fetched, pre-filtered to WARN/ERRO/CRIT, and cached', {
		totalRawLines: allLines.length,
		filteredLines: cachedLogLines.length,
		approximateTokens,
	})

	searchBuffer = []
	cachedCompressedLogs = null

	return JSON.stringify({
		totalRawLines: allLines.length,
		filteredLines: cachedLogLines.length,
		approximateTokens,
		firstTimestamp,
		lastTimestamp,
	})
}

function searchLogsHandler(argsJson: string): string {
	const parsed = SearchLogsInput.parse(JSON.parse(argsJson))

	if (cachedLogLines.length === 0) {
		return JSON.stringify({ error: 'Logs not fetched yet. Call fetch_logs first.' })
	}

	logger.tool('info', 'Searching logs', { query: parsed.query })

	let regex: RegExp
	try {
		regex = new RegExp(parsed.query, 'i')
	} catch {
		return JSON.stringify({ error: `Invalid regex pattern: ${parsed.query}` })
	}

	const matches = cachedLogLines.filter((line) => regex.test(line))

	const existingSet = new Set(searchBuffer)
	let newLinesAdded = 0
	for (const match of matches) {
		if (!existingSet.has(match)) {
			searchBuffer.push(match)
			existingSet.add(match)
			newLinesAdded++
		}
	}

	logger.tool('info', 'Search complete — results added to buffer', {
		query: parsed.query,
		matchCount: matches.length,
		newLinesAdded,
		totalBufferSize: searchBuffer.length,
	})

	return JSON.stringify({
		matchCount: matches.length,
		newLinesAdded,
		totalBufferSize: searchBuffer.length,
		bufferApproxTokens: Math.ceil(searchBuffer.join('\n').length / 3.5),
	})
}

async function compressLogsHandler(argsJson: string): Promise<string> {
	const parsed = CompressLogsInput.parse(JSON.parse(argsJson))

	if (searchBuffer.length === 0) {
		return JSON.stringify({ error: 'Search buffer is empty. Call search_logs first to find relevant log lines.' })
	}

	logger.tool('info', 'Compressing logs via small model', {
		bufferLines: searchBuffer.length,
		mergeWithPrevious: parsed.mergeWithPrevious,
	})

	const result = await compressLogs(
		searchBuffer,
		parsed.instructions,
		parsed.mergeWithPrevious ? (cachedCompressedLogs ?? undefined) : undefined
	)

	cachedCompressedLogs = result.compressed
	searchBuffer = []
	logger.tool('info', 'Compression result cached, search buffer cleared', {
		lineCount: result.lineCount,
		tokenCount: result.tokenCount,
		withinLimit: result.withinLimit,
		newBufferSize: searchBuffer.length,
	})

	return JSON.stringify({
		lineCount: result.lineCount,
		tokenCount: result.tokenCount,
		withinLimit: result.withinLimit,
	})
}

function clearSearchBuffer(): string {
	const previousSize = searchBuffer.length
	searchBuffer = []

	logger.tool('info', 'Search buffer cleared', { previousSize })

	return JSON.stringify({
		cleared: true,
		previousSize,
	})
}

async function submitAnswer(): Promise<string> {
	if (!cachedCompressedLogs) {
		return JSON.stringify({ error: 'No compressed logs available. Call compress_logs first.' })
	}

	const apiKey = process.env.AI_DEVS_API_KEY
	const url = 'https://***hub_endpoint***/verify'

	const payload = {
		apikey: apiKey,
		task: 'failure',
		answer: {
			logs: cachedCompressedLogs,
		},
	}

	const lineCount = cachedCompressedLogs.split('\n').filter((l) => l.trim()).length
	const tokenCount = Math.ceil(cachedCompressedLogs.length / 3.5)

	logger.api('info', 'Submitting cached compressed logs to Centrala', {
		logLength: cachedCompressedLogs.length,
		lineCount,
		tokenCount,
	})

	let responseText: string
	try {
		const response = await axios.post(url, payload)
		responseText = typeof response.data === 'string' ? response.data : JSON.stringify(response.data)
	} catch (error: unknown) {
		if (axios.isAxiosError(error) && error.response) {
			responseText =
				typeof error.response.data === 'string' ? error.response.data : JSON.stringify(error.response.data)
			logger.api('warn', `Centrala returned ${error.response.status}`, { response: responseText })
		} else {
			throw error
		}
	}

	logger.api('info', 'Centrala response received', { response: responseText })

	const flagMatch = responseText.match(FLAG_PATTERN)
	if (flagMatch) {
		logger.agent('info', `FLAG CAPTURED: ${flagMatch[0]}`)
		return JSON.stringify({
			success: true,
			flagFound: true,
			flag: flagMatch[0],
			response: responseText,
		})
	}

	return JSON.stringify({
		success: true,
		flagFound: false,
		response: responseText,
	})
}

export async function executeTool(name: string, argsJson: string): Promise<string> {
	logger.agent('info', `Executing tool: ${name}`)

	switch (name) {
		case 'fetch_logs':
			return fetchLogs()
		case 'search_logs':
			return searchLogsHandler(argsJson)
		case 'compress_logs':
			return compressLogsHandler(argsJson)
		case 'clear_search_buffer':
			return clearSearchBuffer()
		case 'submit_answer':
			return submitAnswer()
		default:
			return JSON.stringify({ error: `Unknown tool: ${name}` })
	}
}
