import axios from 'axios'
import { z } from 'zod/v4'
import { config } from '../config'
import { logger } from '../logger'
import { printSummary, recordAction, setFlag, updateActionPointsLeft } from '../stats'
import { defineAgentTool } from '../tool-factory'

const FLAG_REGEX = /\{FLG:.*?\}/

export const callApiTool = defineAgentTool({
	name: 'call_api',
	description: 'Execute a game API action. Pass the action name and JSON-encoded params, or null for no params.',
	schema: z.object({
		action: z.string().describe('API action name, e.g. help, callHelicopter'),
		params: z.string().nullable().describe('JSON-encoded params object, e.g. {"position":"A7"}'),
	}),
	strict: true,
	handler: async ({ action, params }) => {
		const parsedParams: Record<string, unknown> = params ? (JSON.parse(params) as Record<string, unknown>) : {}

		const payload = {
			apikey: config.aiDevsApiKey,
			task: config.taskName,
			answer: {
				action,
				...parsedParams,
			},
		}

		logger.api('info', `POST ${config.verifyEndpoint}`, { action, params: parsedParams })

		const response = await axios.post(config.verifyEndpoint, payload, {
			validateStatus: () => true,
		})

		const responseText = typeof response.data === 'string' ? response.data : JSON.stringify(response.data)

		const failed = response.status >= 400
		recordAction(action, failed)
		updateActionPointsLeft(responseText)

		logger.api('info', `Response ${response.status}`, { preview: responseText.slice(0, 200) })

		const flagMatch = responseText.match(FLAG_REGEX)
		if (flagMatch) {
			setFlag(flagMatch[0])
			logger.agent('info', `FLAG CAPTURED: ${flagMatch[0]}`)
			printSummary('FLAG CAPTURED')
			process.exit(0)
		}

		return responseText
	},
})
