import { z } from 'zod/v4'
import { defineAgentTool } from '../tool-factory'
import type { AgentTool } from '../tool-factory'

export function createFinishTool(onFinish: (summary: string) => void): AgentTool {
	return defineAgentTool({
		name: 'finish',
		description: 'Report the final outcome of this search zone.',
		schema: z.object({
			summary: z
				.string()
				.describe(
					'Outcome string: confirmed location if target was found (e.g. "found at F6"), or "cluster clear", or an error description'
				),
		}),
		handler: async ({ summary }) => {
			onFinish(summary)
			return 'acknowledged'
		},
	})
}
