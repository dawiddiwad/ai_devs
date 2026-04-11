import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { createConfig, logger, verifyAnswer } from '@ai-devs/core'

const config = createConfig()

export const startGameTool = createTool({
	id: 'start-game',
	description: 'Starts the goingthere game',
	inputSchema: z.object({}),
	outputSchema: z.string().describe('A message confirming the game has started'),
	execute: async () => {
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
