import { z } from 'zod/v4'
import { defineTool } from '../tool-factory'
import { runSubagent } from '../subagent'

export const spawnSubagentTool = defineTool({
	name: 'spawn_subagent',
	description:
		'Spawn a read-only browser scout to gather information from the OKO portal. The sub-agent navigates OKO, finds the requested data, and returns a summary. Use for all OKO data discovery — never browse OKO directly.',
	schema: z.object({
		task: z.string().describe('Specific information to gather from OKO portal'),
	}),
	handler: async ({ task }) => runSubagent(task),
})
