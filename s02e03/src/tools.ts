import axios from 'axios'
import { z } from 'zod'
import type { ChatCompletionTool } from 'openai/resources/chat/completions'
import { logger } from './logger'

const FLAG_PATTERN = /\{FLG:[^}]+\}/

let cachedLogLines: string[] = []

const SearchLogsInput = z.object({
	query: z.string().describe('Regex pattern to search for in the log file'),
	maxResults: z.number().optional().default(100).describe('Maximum number of matching lines to return'),
})

const CountTokensInput = z.object({
	text: z.string().describe('The text to count tokens for'),
})

const SubmitAnswerInput = z.object({
	logs: z.string().describe('The compressed log string with events separated by \\n'),
})

export const toolDefinitions: ChatCompletionTool[] = [
	{
		type: 'function',
		function: {
			name: 'fetch_logs',
			description:
				'Downloads the full log file from the remote URL and caches it. Must be called once before any search operations.',
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
			description: 'Searches the cached log file using a regex pattern. Returns matching lines.',
			parameters: {
				type: 'object',
				properties: {
					query: {
						type: 'string',
						description:
							"Regex pattern to search for in the log file. Examples: 'CRIT|ERRO|WARN', 'ECCS', 'pump|cooling'",
					},
					maxResults: {
						type: 'number',
						description: 'Maximum number of matching lines to return. Default: 100',
					},
				},
				required: ['query'],
			},
		},
	},
	{
		type: 'function',
		function: {
			name: 'count_tokens',
			description:
				'Estimates the token count of a given text using a conservative heuristic (3.5 chars per token).',
			parameters: {
				type: 'object',
				properties: {
					text: {
						type: 'string',
						description: 'The text to count tokens for',
					},
				},
				required: ['text'],
			},
		},
	},
	{
		type: 'function',
		function: {
			name: 'submit_answer',
			description:
				'Submits the compressed logs to Centrala for verification. Returns technician feedback or the flag.',
			parameters: {
				type: 'object',
				properties: {
					logs: {
						type: 'string',
						description: 'The compressed log string with events separated by \\n',
					},
				},
				required: ['logs'],
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
	cachedLogLines = text.split('\n').filter((line) => line.trim() !== '')

	const approximateTokens = Math.ceil(text.length / 3.5)

	logger.tool('info', 'Logs fetched and cached', {
		totalLines: cachedLogLines.length,
		approximateTokens,
	})

	const firstLines = cachedLogLines.slice(0, 5).join('\n')
	const lastLines = cachedLogLines.slice(-3).join('\n')

	return JSON.stringify({
		totalLines: cachedLogLines.length,
		approximateTokens,
		sample: `First 5 lines:\n${firstLines}\n\nLast 3 lines:\n${lastLines}`,
	})
}

function searchLogs(argsJson: string): string {
	const parsed = SearchLogsInput.parse(JSON.parse(argsJson))

	if (cachedLogLines.length === 0) {
		return JSON.stringify({ error: 'Logs not fetched yet. Call fetch_logs first.' })
	}

	logger.tool('info', 'Searching logs', { query: parsed.query, maxResults: parsed.maxResults })

	let regex: RegExp
	try {
		regex = new RegExp(parsed.query, 'i')
	} catch {
		return JSON.stringify({ error: `Invalid regex pattern: ${parsed.query}` })
	}

	const matches: string[] = []
	for (const line of cachedLogLines) {
		if (regex.test(line)) {
			matches.push(line)
			if (matches.length >= parsed.maxResults) break
		}
	}

	logger.tool('info', 'Search complete', {
		query: parsed.query,
		matchCount: matches.length,
	})

	return JSON.stringify({
		matchCount: matches.length,
		returnedCount: matches.length,
		lines: matches.join('\n'),
	})
}

function countTokens(argsJson: string): string {
	const parsed = CountTokensInput.parse(JSON.parse(argsJson))
	const tokenCount = Math.ceil(parsed.text.length / 3.5)
	const withinLimit = tokenCount <= 1500

	logger.tool('info', 'Token count estimated', { tokenCount, withinLimit })

	return JSON.stringify({
		tokenCount,
		withinLimit,
		limit: 1500,
	})
}

async function submitAnswer(argsJson: string): Promise<string> {
	const parsed = SubmitAnswerInput.parse(JSON.parse(argsJson))
	const apiKey = process.env.AI_DEVS_API_KEY
	const url = 'https://***hub_endpoint***/verify'

	const payload = {
		apikey: apiKey,
		task: 'failure',
		answer: {
			logs: parsed.logs,
		},
	}

	logger.api('info', 'Submitting answer to Centrala', {
		logLength: parsed.logs.length,
		lineCount: parsed.logs.split('\n').length,
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
			return searchLogs(argsJson)
		case 'count_tokens':
			return countTokens(argsJson)
		case 'submit_answer':
			return submitAnswer(argsJson)
		default:
			return JSON.stringify({ error: `Unknown tool: ${name}` })
	}
}
