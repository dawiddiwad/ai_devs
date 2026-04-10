import { createTool } from '@mastra/core/tools'
import { logger } from '@ai-devs/core'
import { z } from 'zod'
import { submitTimetravelAnswer } from './timetravel-shared'

export const timetravelGetConfigTool = createTool({
	id: 'timetravel-get-config',
	description: 'Fetch the current timetravel machine configuration as a raw API payload.',
	inputSchema: z.object({}),
	outputSchema: z.string().describe('The raw timetravel getConfig response payload'),
	execute: async () => {
		logger.tool('info', 'Fetching timetravel configuration')

		try {
			const result = await submitTimetravelAnswer({ action: 'getConfig' })
			return result.responseText
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error)

			logger.tool('error', 'Failed to fetch timetravel configuration', { error: errorMessage })

			return JSON.stringify({ status: 'error', message: errorMessage })
		}
	},
})
