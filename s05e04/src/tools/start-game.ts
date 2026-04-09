import { createConfig, defineAgentTool, logger, verifyAnswer } from '@ai-devs/core'
import { z } from 'zod/v4'

const config = createConfig()

export const startGameTool = defineAgentTool({
	name: 'start_game',
	description: 'Start a new game and return the raw response payload.',
	schema: z.object({}),
	handler: async () => {
		logger.tool('info', 'Starting new game')

		try {
			const result = await verifyAnswer(config, { command: 'start' })

			logger.tool('info', 'Game started', {
				response: result.responseText.slice(0, 200),
			})

			return result.responseText
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error)

			logger.tool('error', 'Failed to start game', { error: errorMessage })

			return JSON.stringify({ status: 'error', message: errorMessage })
		}
	},
})
