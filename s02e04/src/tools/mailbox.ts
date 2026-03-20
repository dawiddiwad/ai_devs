import axios from 'axios'
import { config } from '../config'
import { logger } from '../logger'
import { emailRequestSchema, waitSchema } from './definitions'

async function zmailRequest(payload: Record<string, unknown>, retries = 3): Promise<unknown> {
	for (let attempt = 1; attempt <= retries; attempt++) {
		try {
			logger.api('info', 'Zmail API request', { action: payload.action, attempt })
			const response = await axios.post(config.zmailEndpoint, {
				apikey: config.aiDevsApiKey,
				...payload,
			})
			logger.api('info', 'Zmail API response', { action: payload.action, status: response.status })
			return response.data
		} catch (error) {
			const isLast = attempt === retries
			if (axios.isAxiosError(error) && error.response && error.response.status < 500) {
				logger.api('error', 'Zmail API client error', {
					status: error.response.status,
					data: error.response.data,
				})
				throw error
			}
			logger.api('warn', `Zmail API attempt ${attempt} failed`, {
				error: error instanceof Error ? error.message : String(error),
			})
			if (isLast) throw error
			await new Promise((resolve) => setTimeout(resolve, 1000 * Math.pow(2, attempt - 1)))
		}
	}
	throw new Error('Unreachable')
}

export async function emailRequest(args: unknown): Promise<string> {
	const parsed = emailRequestSchema.parse(args)
	const { action, ...params } = parsed
	logger.tool('info', 'email_request called', { action, params })
	const data = await zmailRequest({ action, ...params })
	logger.tool('info', 'email_request result', { action, data })
	return JSON.stringify(data)
}

export async function wait(args: unknown): Promise<string> {
	const parsed = waitSchema.parse(args)
	const seconds = parsed.seconds ?? 30
	logger.tool('info', `Waiting ${seconds} seconds`, { seconds })
	await new Promise((resolve) => setTimeout(resolve, seconds * 1000))
	return JSON.stringify({ waited: seconds })
}
