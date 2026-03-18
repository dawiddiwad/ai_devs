import dotenv from 'dotenv'
dotenv.config()

import { runAgent } from './agent'
import { logger } from './logger'

async function main(): Promise<void> {
	logger.agent('info', 'Starting failure log analysis agent')

	const requiredVars = ['OPENAI_API_KEY', 'AI_DEVS_API_KEY']
	for (const varName of requiredVars) {
		if (!process.env[varName]) {
			logger.agent('error', `Missing required environment variable: ${varName}`)
			process.exit(1)
		}
	}

	await runAgent()
}

main().catch((error) => {
	logger.agent('error', 'Unhandled error in agent', {
		error: error instanceof Error ? error.message : String(error),
	})
	process.exit(1)
})
