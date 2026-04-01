import { z } from 'zod/v4'
import { defineAgentTool } from '../tool-factory'
import { runClusterAgent } from '../cluster-agent'

export const spawnClusterAgentTool = defineAgentTool({
	name: 'spawn_cluster_agent',
	description:
		'Spawn a cluster agent to execute a pre-planned search of one building cluster. Pass the full cluster plan JSON including help docs, cells to inspect, action sequence, and point budget. Returns "found at XN" or "cluster clear".',
	schema: z.object({
		plan: z
			.string()
			.describe(
				'JSON string with the cluster mission: { clusterId, cells, pointBudget, helpResponse, actions[] }'
			),
	}),
	handler: async ({ plan }) => runClusterAgent(plan),
})
