import { createTool } from '@mastra/core/tools'
import { logger } from '@ai-devs/core'
import { z } from 'zod'
import { submitTimetravelAnswer } from './timetravel-shared'

export const timetravelResetTool = createTool({
	id: 'timetravel-reset',
	description: 'Reset the timetravel device and return the raw API payload.',
	inputSchema: z.object({}),
	outputSchema: z.string().describe('The raw timetravel reset response payload'),
	execute: async () => {
		logger.tool('info', 'Resetting timetravel device')

		try {
			const result = await submitTimetravelAnswer({ action: 'reset' })
			return result.responseText
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error)

			logger.tool('error', 'Failed to reset timetravel device', { error: errorMessage })

			return JSON.stringify({ status: 'error', message: errorMessage })
		}
	},
})
