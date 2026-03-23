import axios from 'axios'
import { config } from '../config'
import { logger } from '../logger'

const FLAG_REGEX = /\{\{FLG:.*?\}\}/

export async function verifyResult(anomalyIds: string[]): Promise<{ response: string; flag: string | null }> {
	const payload = {
		apikey: config.aiDevsApiKey,
		task: config.taskName,
		answer: {
			recheck: anomalyIds,
		},
	}

	logger.api('info', 'Submitting verification request', {
		endpoint: config.verifyEndpoint,
		anomaly_count: anomalyIds.length,
	})

	const response = await axios.post(config.verifyEndpoint, payload, {
		validateStatus: () => true,
	})
	const responseBody = typeof response.data === 'string' ? response.data : JSON.stringify(response.data)

	logger.api('info', 'Verification response received', { response: responseBody })

	const flagMatch = responseBody.match(FLAG_REGEX)
	if (flagMatch) {
		const flag = flagMatch[0]
		logger.agent('info', `FLAG CAPTURED: ${flag}`)
		return { response: responseBody, flag }
	}

	return { response: responseBody, flag: null }
}
