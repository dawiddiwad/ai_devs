import axios from 'axios'
import type { ChatCompletionTool } from 'openai/resources/chat/completions'
import { config } from '../config'
import { logger } from '../logger'
import { ToolSearchArgsSchema } from '../types'

export const searchToolDefinition: ChatCompletionTool = {
	type: 'function',
	function: {
		name: 'tool_search',
		description:
			'Discovers available tools. Query returns only up to 3 tools at once with endpoint URLs and descriptions.',
		parameters: {
			type: 'object',
			properties: {
				query: { type: 'string', description: 'Natural language or keyword query' },
			},
			required: ['query'],
		},
	},
}

export async function toolSearch(args: unknown): Promise<string> {
	const parsed = ToolSearchArgsSchema.safeParse(args)
	if (!parsed.success) {
		return JSON.stringify({ error: `Invalid args: ${parsed.error.message}` })
	}

	const { query } = parsed.data
	logger.tool('info', 'tool_search', { query })

	const response = await axios.post(
		config.toolSearchEndpoint,
		{ apikey: config.aiDevsApiKey, query },
		{ validateStatus: () => true }
	)

	logger.api('info', 'toolsearch response', { status: response.status })

	const result = typeof response.data === 'string' ? response.data : JSON.stringify(response.data)
	return result
}
