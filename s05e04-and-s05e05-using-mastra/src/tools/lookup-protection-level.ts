import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { getExpectedInternalMode, getProtectionLevel } from './timetravel-shared'

export const lookupProtectionLevelTool = createTool({
	id: 'lookup-protection-level',
	description: 'Look up the documented PWR protection level and expected internalMode for a year.',
	inputSchema: z.object({
		year: z.number().int().min(1500).max(2499),
	}),
	outputSchema: z.object({
		year: z.number(),
		protectionLevel: z.number(),
		expectedInternalMode: z.number(),
	}),
	execute: async ({ year }) => ({
		year,
		protectionLevel: await getProtectionLevel(year),
		expectedInternalMode: getExpectedInternalMode(year),
	}),
})
