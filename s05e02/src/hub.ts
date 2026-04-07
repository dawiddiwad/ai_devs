import { captureFlag, createConfig, logger } from '@ai-devs/core'
import axios from 'axios'

const config = createConfig()

type OperatorResponse = {
	audio: string
	message: string
	hint: string
}

function exitOnCapturedFlag(text: string): void {
	const flag = captureFlag(text)
	if (!flag) {
		return
	}

	logger.agent('info', `FLAG CAPTURED: ${flag}`)
	process.exit(0)
}

export async function startCallSession(): Promise<string> {
	try {
		logger.api('info', 'Starting call session')

		const response = await axios.post(
			config.verifyEndpoint,
			{
				apikey: config.aiDevsApiKey,
				task: config.taskName,
				answer: {
					action: 'start',
				},
			},
			{ validateStatus: () => true }
		)

		const responseAsText = JSON.stringify(response.data)
		exitOnCapturedFlag(responseAsText)

		logger.api('info', 'Call session started', {
			response: responseAsText.slice(0, 200),
		})

		return responseAsText
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error)

		logger.api('error', 'Failed to start call session', { error: errorMessage })
		throw new Error(`Failed to start call session: ${errorMessage}`)
	}
}

export async function sendMessageToOperator(payload: { audio: string }): Promise<OperatorResponse> {
	const result = await axios.post(
		config.verifyEndpoint,
		{
			apikey: config.aiDevsApiKey,
			task: config.taskName,
			answer: {
				audio: payload.audio,
			},
		},
		{ validateStatus: () => true }
	)

	const reponseAsText = JSON.stringify(result.data)
	exitOnCapturedFlag(reponseAsText)

	if (result.data.audio) {
		logger.api('info', 'Received message from operator', {
			message: result.data.message,
		})
		return {
			audio: result.data.audio,
			message: result.data.message,
			hint: result.data.hint,
		} as OperatorResponse
	} else {
		logger.api('error', 'Operator did not repond with audio', {
			response: reponseAsText,
		})
		throw new Error('Operator did not respond with audio')
	}
}
