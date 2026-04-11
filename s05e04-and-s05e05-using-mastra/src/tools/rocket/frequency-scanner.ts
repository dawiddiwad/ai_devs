import { createHash } from 'crypto'
import { createTool } from '@mastra/core/tools'
import axios from 'axios'
import { createConfig, logger } from '@ai-devs/core'
import { z } from 'zod'
import { retry } from '../shared'
import { filterHupResponse, stringifyUnknown } from './shared'

const config = createConfig()

export const frequencyScannerTool = createTool({
	id: 'frequency-scanner',
	description:
		'Interact with the OKO frequency scanner. Use action listen with frequency=null and detectionCode=null to get the raw scanner payload, or action disarm with real frequency and detectionCode to send a disarm request.',
	inputSchema: z.object({
		action: z
			.enum(['listen', 'disarm'])
			.describe('Whether to listen to the frequency scanner or to send a disarm command'),
		frequency: z.number().nullable().optional().describe('Required for disarm action, null for listen action'),
		detectionCode: z.string().nullable().optional().describe('Required for disarm action, null for listen action'),
	}),
	outputSchema: z.string().describe('The raw frequency scanner response payload'),
	execute: async ({ action, frequency, detectionCode }) => {
		logger.tool('info', 'Calling frequency scanner', {
			action: action ?? undefined,
			frequency: frequency ?? undefined,
			detectionCode: detectionCode ?? undefined,
		})

		try {
			if (action === 'disarm' && (!frequency || !detectionCode)) {
				return JSON.stringify({
					status: 'error',
					action,
					message: 'frequency and detectionCode are required for disarm action',
				})
			}

			const payload = await retry({
				label: `frequency scanner ${action}`,
				attempts: 10,
				delayMs: 2000,
				operation: async () => {
					if (action === 'listen') {
						const response = await axios.get(
							`${config.hubEndpoint}/api/frequencyScanner?key=${encodeURIComponent(config.aiDevsApiKey)}`,
							{ validateStatus: () => true }
						)

						const filtered = filterHupResponse(response)
						if (filtered.repeat) {
							throw new Error(filtered.reason)
						}

						logger.api('info', 'Received frequency listen response', {
							response: JSON.stringify(response.data),
						})

						return stringifyUnknown(response.data)
					}

					const disarmHash = createHash('sha1')
						.update(detectionCode + 'disarm')
						.digest('hex')
					const disarmPayload = {
						apikey: config.aiDevsApiKey,
						frequency,
						disarmHash,
					}

					logger.tool('info', 'Sending frequency scanner disarm request', {
						frequency: disarmPayload.frequency,
						disarmHash: disarmPayload.disarmHash,
					})

					const response = await axios.post(`${config.hubEndpoint}/api/frequencyScanner`, disarmPayload, {
						validateStatus: () => true,
					})

					const filtered = filterHupResponse(response)
					if (filtered.repeat) {
						throw new Error(filtered.reason)
					}

					logger.api('info', 'Received frequency scanner disarm response', {
						response: JSON.stringify(response.data),
						status: response.status,
						frequency,
					})

					return stringifyUnknown(response.data)
				},
			})

			logger.tool('info', 'Frequency scanner completed', {
				action,
				response: payload,
			})

			return payload
		} catch (error) {
			logger.tool('error', 'Frequency scanner failed', {
				status: 'error',
				action,
				error,
			})

			return JSON.stringify({
				status: 'error',
				action,
				error,
			})
		}
	},
})
