import { logger } from '../logger'
import { finishSchema } from './definitions'

export function finish(args: unknown): never {
	const parsed = finishSchema.parse(args)
	logger.agent('info', 'Flag captured — terminating', { flag: parsed.flag })
	process.exit(0)
}
