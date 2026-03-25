import axios from 'axios'
import { config } from './config'
import { logger } from './logger'
import { Command, ReactorResponse, ReactorResponseSchema } from './types'

const FLAG_REGEX = /\{FLG:.*?\}/

export async function sendCommand(command: Command): Promise<ReactorResponse> {
	const payload = {
		apikey: config.aiDevsApiKey,
		task: config.taskName,
		answer: { command },
	}

	logger.api('info', `POST ${command}`, { url: config.verifyEndpoint })

	const response = await axios.post(config.verifyEndpoint, payload, {
		validateStatus: () => true,
	})

	logger.api('info', 'Response received', {
		status: response.status,
		message: response.data?.message,
	})

	const flagMatch = JSON.stringify(response.data).match(FLAG_REGEX)
	if (flagMatch) {
		logger.agent('info', `FLAG CAPTURED: ${flagMatch[0]}`)
		process.exit(0)
	}

	const parsed = ReactorResponseSchema.parse(response.data)
	return parsed
}
