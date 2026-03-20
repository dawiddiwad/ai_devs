import OpenAI from 'openai'
import { config } from './config'
import { logger } from './logger'
import { runAgent } from './agent'

async function main(): Promise<void> {
	logger.agent('info', 'Initializing drone mission agent', {
		model: config.openaiModel,
		visionModel: config.openaiVisionModel,
		task: config.taskName,
	})

	const openaiClient = new OpenAI({
		apiKey: config.openaiApiKey,
		...(config.openaiBaseUrl ? { baseURL: config.openaiBaseUrl } : {}),
	})

	await runAgent(openaiClient)
}

main().catch((error) => {
	logger.agent('error', 'Unhandled error in main', {
		error: error instanceof Error ? error.message : String(error),
	})
	process.exit(1)
})
