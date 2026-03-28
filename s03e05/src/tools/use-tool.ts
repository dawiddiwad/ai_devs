import axios from 'axios'
import { config } from '../config'
import { logger } from '../logger'
import { UseToolArgsSchema } from '../types'
import { FunctionTool } from 'openai/resources/responses/responses'

export const useToolDefinition: FunctionTool = {
	type: 'function',
	name: 'use_tool',
	description: `Calls any discovered tool endpoint with a natural language query. Use endpoints returned by search_tool. Provide reasoning for using the tool and how it fits into your overall plan.`,
	parameters: {
		type: 'object',
		properties: {
			endpoint: { type: 'string', description: 'Full URL of the discovered tool' },
			query: { type: 'string', description: 'Natural language query or keywords in English' },
			reasoning: {
				type: 'string',
				description: 'Your brief reasoning for using this tool and how it fits into your overall plan',
			},
		},
		required: ['endpoint', 'query', 'reasoning'],
		additionalProperties: false,
	},
	strict: true,
}

export async function useTool(args: unknown): Promise<string> {
	const parsed = UseToolArgsSchema.safeParse(args)
	if (!parsed.success) {
		return JSON.stringify({ error: `Invalid args: ${parsed.error.message}` })
	}

	const { endpoint, query, reasoning } = parsed.data
	logger.tool('info', 'use_tool', { endpoint, query, reasoning })

	const response = await axios.post(endpoint, { apikey: config.aiDevsApiKey, query }, { validateStatus: () => true })

	logger.api('info', 'tool response', { endpoint, status: response.status, response: response.data })

	const result = typeof response.data === 'string' ? response.data : JSON.stringify(response.data)
	return result
}
