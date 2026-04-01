import { config } from './config'
import { logger } from './logger'
import { runAgent } from './agent'

async function main() {
	logger.agent('info', 'Starting task', { task: config.taskName })
	await runAgent()
}

main().catch((error) => {
	logger.agent('error', 'Unhandled error', {
		error: error instanceof Error ? error.message : String(error),
	})
	process.exit(1)
})
