import { z } from 'zod/v4'
import axios from 'axios'
import { config } from '../config'
import { logger } from '../logger'
import { defineTool } from '../tool-factory'

const FLAG_REGEX = /\{FLG:.*?\}/

const schema = z
	.object({
		action: z.string().describe('API action to perform (use help to discover available actions)'),
	})
	.catchall(z.unknown())

export const centralaTool = defineTool({
	name: 'centrala',
	description:
		'Submit an action to the Centrala /verify endpoint. All key-value pairs you pass become fields inside the answer object. Use action=help first to discover the API. Pass all required fields as top-level keys.',
	schema,
	strict: false,
	handler: async (params) => {
		const payload = {
			apikey: config.aiDevsApiKey,
			task: config.taskName,
			answer: params,
		}

		logger.tool('info', `Centrala action: ${params.action}`, { payload: JSON.stringify(payload, null, 2) })
		logger.api('info', 'POST', { endpoint: config.verifyEndpoint, action: params.action })

		const response = await axios.post(config.verifyEndpoint, payload, {
			validateStatus: () => true,
		})

		const responseText = typeof response.data === 'string' ? response.data : JSON.stringify(response.data)

		const flagMatch = responseText.match(FLAG_REGEX)
		if (flagMatch) {
			logger.agent('info', `FLAG CAPTURED: ${flagMatch[0]}`)
			process.exit(0)
		}

		logger.api('info', `Response ${response.status} length: ${responseText.length}`, { responseText })
		return JSON.stringify({ status: response.status, body: response.data })
	},
})
