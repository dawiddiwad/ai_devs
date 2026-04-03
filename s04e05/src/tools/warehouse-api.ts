import { z } from 'zod/v4'
import { defineAgentTool, createConfig, verifyAnswer, logger } from '@ai-devs/core'

const config = createConfig()

export const warehouseApiTool = defineAgentTool({
	name: 'warehouse_api',
	description:
		'Call the warehouse API. All tools (help, orders, database, signatureGenerator, reset, done) go through this. Pass tool name and additional params as a JSON string.',
	schema: z.object({
		tool: z.string().describe('API tool name: help | orders | database | signatureGenerator | reset | done'),
		params: z
			.string()
			.nullable()
			.describe(
				'JSON string of additional fields merged into the payload. Examples: {"action":"get"} or {"query":"show tables"} or {"action":"create","title":"...","creatorID":2,"destination":"1234","signature":"..."} or {"action":"append","id":"...","items":{"bread":45,"water":120}}'
			),
	}),
	handler: async ({ tool, params }) => {
		const parsed = params != null ? (JSON.parse(params) as Record<string, unknown>) : {}
		const payload = { tool, ...parsed }
		logger.tool('info', 'warehouse_api call', { tool, params })
		try {
			const result = await verifyAnswer(config, payload, { exitOnFlag: true })
			return result.responseText
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			logger.tool('error', 'warehouse_api failed', { tool, error: message })
			return JSON.stringify({ error: message })
		}
	},
})
