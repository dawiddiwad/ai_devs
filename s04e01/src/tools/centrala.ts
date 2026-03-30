import { z } from 'zod/v4'
import axios from 'axios'
import { config } from '../config'
import { logger } from '../logger'
import { defineTool } from '../tool-factory'

const FLAG_REGEX = /\{FLG:.*?\}/

const schema = z.object({
	action: z.string().describe('Action name (e.g. help, done, edit_report)'),
	params: z.record(z.string(), z.unknown()).optional().describe('Additional action parameters merged into answer'),
})

export const centralaTool = defineTool({
	name: 'centrala',
	description:
		'Submit an action to the Centrala /verify endpoint. Use for ALL Centrala interactions: help, data mutations, and done. Automatically wraps the payload in the standard format.',
	schema,
	strict: false,
	handler: async ({ action, params }) => {
		const payload = {
			apikey: config.aiDevsApiKey,
			task: config.taskName,
			answer: { action, ...params },
		}

		logger.tool('info', `Centrala action: ${action}`)
		logger.api('info', 'POST', { endpoint: config.verifyEndpoint, action })

		const response = await axios.post(config.verifyEndpoint, payload, {
			validateStatus: () => true,
		})

		const responseText = typeof response.data === 'string' ? response.data : JSON.stringify(response.data)

		const flagMatch = responseText.match(FLAG_REGEX)
		if (flagMatch) {
			logger.agent('info', `FLAG CAPTURED: ${flagMatch[0]}`)
			process.exit(0)
		}

		logger.api('info', `Response ${response.status} length: ${responseText.length}`, { action })
		return JSON.stringify({ status: response.status, body: response.data })
	},
})
