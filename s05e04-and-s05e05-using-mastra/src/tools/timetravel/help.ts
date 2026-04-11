import { createTool } from '@mastra/core/tools'
import { logger } from '@ai-devs/core'
import { z } from 'zod'
import { submitTimetravelAnswer } from './shared'

export const timetravelHelpTool = createTool({
	id: 'timetravel-help',
	description: 'Fetch timetravel help and return the raw API payload.',
	inputSchema: z.object({}),
	outputSchema: z.string().describe('The raw timetravel help response payload'),
	execute: async () => {
		logger.tool('info', 'Fetching timetravel help')

		try {
			const result = await submitTimetravelAnswer({ action: 'help' })
			return result.responseText
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error)

			logger.tool('error', 'Failed to fetch timetravel help', { error: errorMessage })

			return JSON.stringify({ status: 'error', message: errorMessage })
		}
	},
})
