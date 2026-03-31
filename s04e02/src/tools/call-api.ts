import { z } from 'zod/v4'
import { callApi, collectMatchingResult, isQueueConfirmation } from '../api'
import { defineAgentTool } from '../tool-factory'

export const callApiTool = defineAgentTool({
	name: 'call_api',
	description:
		'Call any turbine API action. For async actions (get, unlockCodeGenerator) waits for the queued result. For sync actions (config, done) returns immediately.',
	schema: z.object({
		action: z.string().describe('API action name from docs, e.g. "get", "unlockCodeGenerator", "config", "done"'),
		params: z
			.string()
			.nullable()
			.describe(
				'JSON-encoded params object, e.g. {"param":"weather"} or {"startDate":"2024-01-01","startHour":"12:00:00","windMs":10,"pitchAngle":15}. Pass null if no params needed.'
			),
	}),
	handler: async ({ action, params }) => {
		const parsedParams: Record<string, unknown> = params ? (JSON.parse(params) as Record<string, unknown>) : {}
		const response = await callApi(action, parsedParams)

		if (!isQueueConfirmation(response)) {
			return JSON.stringify(response)
		}

		const sourceKey = (parsedParams['param'] as string | undefined) ?? action
		const predicate: (r: Record<string, unknown>) => boolean = (r) => r['sourceFunction'] === sourceKey

		const result = await collectMatchingResult(predicate)
		return JSON.stringify(result)
	},
})
