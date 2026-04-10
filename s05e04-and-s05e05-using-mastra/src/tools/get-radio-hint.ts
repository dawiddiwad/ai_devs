import { createTool } from '@mastra/core/tools'
import axios from 'axios'
import { createConfig, logger } from '@ai-devs/core'
import { z } from 'zod'
import { retry } from '../utils/retry'
import { filterHupResponse, stringifyUnknown } from './shared'

const config = createConfig()

export const getRadioHintTool = createTool({
	id: 'get-radio-hint',
	description: 'Fetch the current radio hint and return the raw response payload.',
	inputSchema: z.object({}),
	outputSchema: z.string().describe('The raw radio hint response payload'),
	execute: async () => {
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

					const filtered = filterHupResponse(response)
					if (filtered.repeat) {
						throw new Error(filtered.reason)
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
