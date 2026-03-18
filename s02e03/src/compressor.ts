import OpenAI from 'openai'
import { COMPRESSOR_SYSTEM_PROMPT } from './prompts'
import { logger } from './logger'

const TOKEN_LIMIT = 1500
const CHARS_PER_TOKEN = 3
const MAX_COMPRESSION_PASSES = 3

function estimateTokens(text: string): number {
	return Math.ceil(text.length / CHARS_PER_TOKEN)
}

export async function compressLogs(
	logLines: string[],
	instructions: string,
	previousCompressed?: string
): Promise<{ compressed: string; lineCount: number; tokenCount: number; withinLimit: boolean }> {
	const client = new OpenAI()
	const model = process.env.OPENAI_COMPRESSOR_MODEL || 'gpt-4.1-mini'

	let input = logLines.join('\n')

	for (let pass = 1; pass <= MAX_COMPRESSION_PASSES; pass++) {
		const inputTokens = estimateTokens(input)

		logger.tool('info', `Compression pass ${pass}/${MAX_COMPRESSION_PASSES}`, {
			model,
			inputLines: input.split('\n').length,
			inputTokens,
		})

		const userMessage = buildCompressorUserMessage(
			input,
			instructions,
			pass === 1 ? previousCompressed : undefined,
			pass
		)

		logger.api('info', 'Calling compressor model', { model, pass })

		const response = await client.chat.completions.create({
			model,
			messages: [
				{ role: 'system', content: COMPRESSOR_SYSTEM_PROMPT },
				{ role: 'user', content: userMessage },
			],
			temperature: process.env.OPENAI_TEMPERATURE ? parseFloat(process.env.OPENAI_TEMPERATURE) : undefined,
		})

		const compressed = response.choices[0].message.content?.trim() || ''
		const tokenCount = estimateTokens(compressed)
		const lineCount = compressed.split('\n').filter((l) => l.trim()).length

		logger.tool('info', `Compression pass ${pass} complete`, {
			outputLines: lineCount,
			outputTokens: tokenCount,
			withinLimit: tokenCount <= TOKEN_LIMIT,
			usage: response.usage,
		})

		if (tokenCount <= TOKEN_LIMIT) {
			return { compressed, lineCount, tokenCount, withinLimit: true }
		}

		if (pass < MAX_COMPRESSION_PASSES) {
			logger.tool('warn', `Output exceeds ${TOKEN_LIMIT} tokens (${tokenCount}), re-compressing`, {
				pass,
			})
			input = compressed
		} else {
			logger.tool('warn', `Max compression passes reached, output still over limit`, {
				tokenCount,
			})
			return { compressed, lineCount, tokenCount, withinLimit: false }
		}
	}

	throw new Error('Unreachable')
}

function buildCompressorUserMessage(
	rawLogs: string,
	instructions: string,
	previousCompressed: string | undefined,
	pass: number
): string {
	const isRecompression = pass > 1

	let message = isRecompression
		? `## Pre-compressed log lines (STILL TOO LONG — compress further)\n\n${rawLogs}`
		: `## Raw log lines to compress\n\n${rawLogs}`

	message += `\n\n## Instructions\n\n${instructions}`

	if (previousCompressed && !isRecompression) {
		message += `\n\n## Previous compressed output (for reference / merging)\n\n${previousCompressed}`
	}

	const charBudget = Math.floor(TOKEN_LIMIT * CHARS_PER_TOKEN)
	message += `\n\n## Token budget\n\nYour output MUST be ≤${TOKEN_LIMIT} tokens (≈${charBudget} characters). Current input is ~${estimateTokens(rawLogs)} tokens.`

	return message
}
