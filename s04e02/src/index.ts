import { runAgent } from './agent'
import { callApi } from './api'
import { logger } from './logger'

async function main() {
	logger.agent('info', 'Windpower turbine scheduler starting')
	await callApi('start')
	logger.agent('info', 'Service window opened')
	const helpDocs = await callApi('help')
	await runAgent(helpDocs)
}

main().catch((error) => {
	logger.agent('error', 'Unhandled error', {
		error: error instanceof Error ? error.message : String(error),
	})
	process.exit(1)
})
