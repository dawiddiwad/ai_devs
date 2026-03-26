import axios from 'axios'
import { config } from './config'
import { logger } from './logger'

const FLAG_REGEX = /\{FLG:.*?\}/

async function registerTools(): Promise<void> {
	const payload = {
		task: config.taskName,
		apikey: config.aiDevsApiKey,
		answer: {
			tools: [
				{
					URL: `${config.publicBaseUrl}:${config.serverPort}/find`,
					description:
						'Finds cities that sell a specific item. Pass a natural language description of the item in the "params" field. Returns a list of city names that sell the item. Call once per item you are looking for. Intersect the city lists yourself to find cities offering all needed items simultaneously.',
				},
			],
		},
	}

	logger.agent('info', 'Registering tools with centrala', {
		url: `${config.publicBaseUrl}:${config.serverPort}/find`,
	})

	const response = await axios.post(config.verifyEndpoint, payload, {
		validateStatus: () => true,
	})

	const responseText = typeof response.data === 'string' ? response.data : JSON.stringify(response.data)
	logger.api('info', 'Tool registration response', { status: response.status, body: responseText })

	const flagMatch = responseText.match(FLAG_REGEX)
	if (flagMatch) {
		logger.agent('info', `FLAG CAPTURED: ${flagMatch[0]}`)
		process.exit(0)
	}
}

async function pollForFlag(): Promise<void> {
	const MAX_ATTEMPTS = 24
	const DELAY_MS = 5000

	const checkPayload = {
		task: config.taskName,
		apikey: config.aiDevsApiKey,
		answer: {
			action: 'check',
		},
	}

	for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
		logger.agent('info', `Polling for flag`, { attempt, maxAttempts: MAX_ATTEMPTS })

		await new Promise((resolve) => setTimeout(resolve, DELAY_MS))

		const response = await axios.post(config.verifyEndpoint, checkPayload, {
			validateStatus: () => true,
		})

		const responseText = typeof response.data === 'string' ? response.data : JSON.stringify(response.data)
		logger.api('info', 'Poll response', { status: response.status, body: responseText })

		const flagMatch = responseText.match(FLAG_REGEX)
		if (flagMatch) {
			logger.agent('info', `FLAG CAPTURED: ${flagMatch[0]}`)
			process.exit(0)
		}
	}

	logger.agent('warn', 'No flag received after polling timeout')
	process.exit(1)
}

async function main(): Promise<void> {
	logger.agent('info', 'Starting task', { task: config.taskName })
	await registerTools()
	await pollForFlag()
}

main().catch((error) => {
	logger.agent('error', 'Unhandled error', {
		error: error instanceof Error ? error.message : String(error),
	})
	process.exit(1)
})
