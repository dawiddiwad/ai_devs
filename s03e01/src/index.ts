import { logger } from './logger'
import { runAgent } from './agent'

async function main(): Promise<void> {
	logger.agent('info', 'Starting sensor anomaly detection agent')

	try {
		await runAgent()
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		logger.agent('error', 'Agent failed with error', { error: message })
		process.exit(1)
	}
}

main()
