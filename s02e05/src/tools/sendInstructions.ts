import axios from 'axios'
import { config } from '../config'
import { logger } from '../logger'
import { sendInstructionsInputSchema, verifyPayloadSchema } from '../types'

const FLAG_REGEX = /\{FLG:[^}]+\}/

export async function sendInstructions(instructions: string[]): Promise<{ response: string; flagFound: boolean }> {
	const validated = sendInstructionsInputSchema.parse({ instructions })

	const payload = verifyPayloadSchema.parse({
		apikey: config.aiDevsApiKey,
		task: config.taskName,
		answer: {
			instructions: validated.instructions,
		},
	})

	logger.api('info', 'Sending drone instructions to verify endpoint', {
		endpoint: config.verifyEndpoint,
		instructions: validated.instructions,
	})

	const response = await axios.post(config.verifyEndpoint, payload, {
		validateStatus: () => true,
	})
	const responseText = typeof response.data === 'string' ? response.data : JSON.stringify(response.data)

	logger.api('info', 'Verify endpoint response', { status: response.status, body: responseText })

	const flagMatch = responseText.match(FLAG_REGEX)
	if (flagMatch) {
		logger.agent('info', 'Flag captured', { flag: flagMatch[0] })
		process.exit(0)
	}

	return { response: responseText, flagFound: false }
}
