import axios from 'axios'
import { config } from '../config'
import { logger } from '../logger'
import { ToolSearchArgsSchema } from '../types'
import { FunctionTool } from 'openai/resources/responses/responses'

export const searchToolDefinition: FunctionTool = {
	type: 'function',
	name: 'tool_search',
	description: 'Tool for discovering available tools. Returns only up to 3 best matching results for the query.',
	parameters: {
		type: 'object',
		properties: {
			query: { type: 'string', description: 'Natural language or keyword query' },
		},
		required: ['query'],
		additionalProperties: false,
	},
	strict: true,
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

	logger.api('info', 'toolsearch response', { status: response.status, response: response.data })

	const result = typeof response.data === 'string' ? response.data : JSON.stringify(response.data)
	return result
}
