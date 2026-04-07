import { defineAgentTool, logger } from '@ai-devs/core'
import { z } from 'zod/v4'
import { startCallSession } from '../hub.js'

export const startCallTool = defineAgentTool({
	name: 'start_call',
	description: 'Start or restart the phone call session before any spoken exchange.',
	schema: z.object({}),
	handler: async () => {
		try {
			const result = await startCallSession()
			return result
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error)

			logger.tool('error', 'Failed to start call session', { error: errorMessage })
			return JSON.stringify({ error: errorMessage })
		}
	},
})
