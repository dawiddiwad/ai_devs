import { z } from 'zod/v4'
import { defineTool } from '../tool-factory'

export const finishTool = defineTool({
	name: 'finish',
	description:
		'Call this when you have gathered all requested information. Provide a complete summary including all IDs, exact field values, and anything the orchestrator will need.',
	schema: z.object({
		summary: z.string().describe('Complete summary of gathered information with exact IDs and field values'),
	}),
	handler: async ({ summary }) => summary,
})
