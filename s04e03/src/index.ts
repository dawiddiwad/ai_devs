import { config } from './config'
import { logger } from './logger'
import { runOrchestrator } from './agent'

async function main() {
	logger.agent('info', 'Starting task', { task: config.taskName })
	await runOrchestrator()
}

main().catch((error) => {
	logger.agent('error', 'Unhandled error', {
		error: error instanceof Error ? error.message : String(error),
	})
	process.exit(1)
})
