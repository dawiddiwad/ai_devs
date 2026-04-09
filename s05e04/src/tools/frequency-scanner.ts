import axios from 'axios'
import { createConfig, defineAgentTool, logger } from '@ai-devs/core'
import { z } from 'zod/v4'
import { retry } from '../utils/retry.js'
import { createHash } from 'crypto'

const config = createConfig()

function getHubBaseUrl() {
	return config.verifyEndpoint.replace(/\/verify\/?$/, '')
}

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

const schema = z.object({
	action: z
		.enum(['listen', 'disarm'])
		.describe('Whether to listen to the frequency scanner or to send a disarm command'),
	frequency: z.number().nullable().describe('Required for disarm action, null for listen action'),
	detectionCode: z.string().nullable().describe('Required for disarm action, null for listen action'),
})

export const frequencyScannerTool = defineAgentTool({
	name: 'frequency_scanner',
	description:
		'Interact with the OKO frequency scanner. Use action listen with frequency=null and detectionCode=null to get the raw scanner payload, or action disarm with real frequency and detectionCode to send a disarm request.',
	schema,
	handler: async ({ action, frequency, detectionCode }) => {
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

			if (!action) {
				return `Invalid action: ${action}, use 'listen' or 'disarm'`
			}

			const payload = await retry({
				label: `frequency scanner ${action}`,
				attempts: 10,
				delayMs: 2000,
				operation: async () => {
					if (action === 'listen') {
						const response = await axios.get(
							`${getHubBaseUrl()}/api/frequencyScanner?key=${encodeURIComponent(config.aiDevsApiKey)}`,
							{ validateStatus: () => true }
						)

						if (JSON.stringify(response.data).toLocaleLowerCase().includes('crash')) {
							return `rocket crashed, please restart, response: ${JSON.stringify(response.data)}`
						}

						if (JSON.stringify(response.data).length > 1000) {
							throw new Error(
								`listen response too long to display with ${JSON.stringify(response.data).length} characters`
							)
						}

						logger.api('info', 'Received frequency scanner listen response', {
							response: JSON.stringify(response.data),
						})

						if (response.status >= 400) {
							throw new Error(
								`Frequency scanner listen returned status ${response.status} and data ${JSON.stringify(response.data)}`
							)
						}

						logger.api('info', 'Received frequency listen response', {
							response: JSON.stringify(response.data),
						})

						return stringifyUnknown(response.data)
					} else {
						const disarmHash = createHash('sha1')
							.update(detectionCode + 'disarm')
							.digest('hex')
						const disarmPayload = {
							apikey: config.aiDevsApiKey,
							frequency: frequency,
							disarmHash: disarmHash,
						}

						logger.tool('info', 'Sending frequency scanner disarm request', {
							frequency: disarmPayload.frequency,
							disarmHash: disarmPayload.disarmHash,
						})
						const response = await axios.post(`${getHubBaseUrl()}/api/frequencyScanner`, disarmPayload, {
							validateStatus: () => true,
						})

						if (JSON.stringify(response.data).length > 1000) {
							throw new Error(
								`Disarm response too long to display with ${JSON.stringify(response.data).length} characters`
							)
						}

						if (response.status >= 400) {
							throw new Error(
								`Frequency scanner disarm returned status ${response.status} and data ${JSON.stringify(response.data)}`
							)
						}

						logger.api('info', 'Received frequency scanner disarm response', {
							response: JSON.stringify(response.data),
							status: response.status,
							frequency,
						})

						return stringifyUnknown(response.data)
					}
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
				error: error,
			})

			return JSON.stringify({
				status: 'error',
				action,
				error: error,
			})
		}
	},
})
