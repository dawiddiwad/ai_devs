import axios from 'axios'
import { config } from '../config'
import { logger } from '../logger'
import { submitAnswerSchema } from './definitions'

const FLAG_REGEX = /\{FLG:[^}]+\}/

export async function submitAnswer(args: unknown): Promise<string> {
	const parsed = submitAnswerSchema.parse(args)
	logger.tool('info', 'submitAnswer called', { date: parsed.date, confirmation_code: parsed.confirmation_code })

	const payload = {
		apikey: config.aiDevsApiKey,
		task: config.taskName,
		answer: {
			password: parsed.password,
			date: parsed.date,
			confirmation_code: parsed.confirmation_code,
		},
	}

	for (let attempt = 1; attempt <= 3; attempt++) {
		try {
			logger.api('info', 'Verify API request', { attempt })
			const response = await axios.post(config.verifyEndpoint, payload)
			const responseText = typeof response.data === 'string' ? response.data : JSON.stringify(response.data)
			logger.api('info', 'Verify API response', { status: response.status, data: responseText })

			const flagMatch = responseText.match(FLAG_REGEX)
			if (flagMatch) {
				const flag = flagMatch[0]
				logger.agent('info', 'Flag captured', { flag })
				return JSON.stringify({ success: true, flag, rawResponse: responseText })
			}

			return JSON.stringify({ success: false, rawResponse: responseText })
		} catch (error) {
			if (axios.isAxiosError(error) && error.response && error.response.status < 500) {
				const responseText =
					typeof error.response.data === 'string' ? error.response.data : JSON.stringify(error.response.data)
				logger.api('error', 'Verify API client error', { status: error.response.status, data: responseText })

				const flagMatch = responseText.match(FLAG_REGEX)
				if (flagMatch) {
					const flag = flagMatch[0]
					logger.agent('info', 'Flag captured', { flag })
					return JSON.stringify({ success: true, flag, rawResponse: responseText })
				}

				return JSON.stringify({ success: false, rawResponse: responseText })
			}
			logger.api('warn', `Verify API attempt ${attempt} failed`, {
				error: error instanceof Error ? error.message : String(error),
			})
			if (attempt === 3) throw error
			await new Promise((resolve) => setTimeout(resolve, 1000 * Math.pow(2, attempt - 1)))
		}
	}
	throw new Error('Unreachable')
}
