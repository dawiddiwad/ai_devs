import { logger } from './logger'
import { runAgent } from './agent'

async function main() {
	logger.agent.info('Starting firmware debugging agent')

	const result = await runAgent()

	if (!result.success) {
		logger.agent.error('Agent failed to capture the flag')
		process.exit(1)
	}

	process.exit(0)
}

main().catch((error) => {
	logger.agent.error('Unhandled error', { error: error instanceof Error ? error.message : String(error) })
	process.exit(1)
})
