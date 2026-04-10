import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { getSyncRatio } from './timetravel-shared'

export const calculateSyncRatioTool = createTool({
	id: 'calculate-sync-ratio',
	description: 'Calculate the timetravel sync ratio from a target date.',
	inputSchema: z.object({
		day: z.number().int().min(1).max(31),
		month: z.number().int().min(1).max(12),
		year: z.number().int().min(1500).max(2499),
	}),
	outputSchema: z.object({
		weightedSum: z.number(),
		moduloValue: z.number(),
		syncRatio: z.number(),
		syncRatioDisplay: z.string(),
	}),
	execute: async ({ day, month, year }) => getSyncRatio(day, month, year),
})
