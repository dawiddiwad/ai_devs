import { logger } from './logger'
import { run } from './runner'

async function main() {
	logger.agent('info', 'Windpower turbine scheduler starting')
	await run()
}

main().catch((error) => {
	logger.agent('error', 'Unhandled error', {
		error: error instanceof Error ? error.message : String(error),
	})
	process.exit(1)
})
