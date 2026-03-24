import axios from 'axios'
import { config } from '../config'
import { logger } from '../logger'

interface VerifyResponse {
	status: number
	body: unknown
}

export async function submitAnswer(confirmationCode: string): Promise<VerifyResponse> {
	const payload = {
		apikey: config.aiDevsApiKey,
		task: config.taskName,
		answer: {
			confirmation: confirmationCode,
		},
	}

	logger.tool.info('Submitting answer to verify endpoint', { confirmationCode })
	logger.api.info('POST verify API', { url: config.verifyUrl })

	const response = await axios.post(config.verifyUrl, payload, {
		validateStatus: () => true,
	})

	logger.api.info('Verify API response', {
		status: response.status,
		data: response.data,
	})

	const FLAG_REGEX = /\{FLG:.*?\}/
	const flagMatch = response.data?.message?.match(FLAG_REGEX)
	if (flagMatch) {
		logger.tool.info(`FLAG CAPTURED: ${flagMatch[0]}`)
		process.exit(0)
	}

	return {
		status: response.status,
		body: response.data,
	}
}
