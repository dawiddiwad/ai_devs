import { createTool } from '@mastra/core/tools'
import { logger } from '@ai-devs/core'
import { z } from 'zod'
import { submitTimetravelAnswer } from './timetravel-shared'

const configureInputSchema = z.object({
	param: z.enum(['day', 'month', 'year', 'syncRatio', 'stabilization']),
	value: z.number(),
})

export const timetravelConfigureTool = createTool({
	id: 'timetravel-configure',
	description: 'Configure a timetravel API parameter and return the raw API payload.',
	inputSchema: configureInputSchema,
	outputSchema: z.string().describe('The raw timetravel configure response payload'),
	execute: async ({ param, value }) => {
		logger.tool('info', 'Configuring timetravel parameter', { param, value })

		try {
			const result = await submitTimetravelAnswer({
				action: 'configure',
				param,
				value,
			})

			return result.responseText
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error)

			logger.tool('error', 'Failed to configure timetravel parameter', {
				param,
				value,
				error: errorMessage,
			})

			return JSON.stringify({
				status: 'error',
				param,
				value,
				message: errorMessage,
			})
		}
	},
})
