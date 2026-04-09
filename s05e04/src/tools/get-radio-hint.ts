import axios from 'axios'
import { createConfig, defineAgentTool, logger } from '@ai-devs/core'
import { z } from 'zod/v4'
import { retry } from '../utils/retry.js'
import { filterHupResponse } from './move-rocket.js'

const config = createConfig()

function stringifyUnknown(value: unknown): string {
	if (typeof value === 'string') {
		return value
	}

	try {
		return JSON.stringify(value)
	} catch {
		return String(value)
	}
}

export const getRadioHintTool = defineAgentTool({
	name: 'get_radio_hint',
	description: 'Fetch the current radio hint and return the raw response payload.',
	schema: z.object({}),
	handler: async () => {
		const endpoint = `${config.hubEndpoint}/api/getmessage`

		logger.tool('info', 'Fetching radio hint', { endpoint })

		try {
			const payload = await retry({
				label: 'radio hint request',
				attempts: 10,
				delayMs: 1000,
				operation: async () => {
					const response = await axios.post(
						endpoint,
						{ apikey: config.aiDevsApiKey },
						{ validateStatus: () => true }
					)

					if (filterHupResponse(response).repeat) {
						throw new Error(filterHupResponse(response).reason)
					}

					logger.api('info', 'Received radio hint response', { status: response.status })

					return stringifyUnknown(response.data)
				},
			})

			logger.tool('info', 'Radio hint fetched', { response: payload.slice(0, 200) })

			return payload
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error)

			logger.tool('error', 'Failed to fetch radio hint', { error: errorMessage })

			return JSON.stringify({
				status: 'error',
				message: errorMessage,
			})
		}
	},
})
