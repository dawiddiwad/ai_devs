import { z } from 'zod/v4'
import { defineAgentTool } from '../tool-factory'
import { runClusterAgent } from '../cluster-agent'

export const spawnClusterAgentTool = defineAgentTool({
	name: 'spawn_cluster_agent',
	description: 'Delegate a building cluster search to a field agent. Returns "found at XN" or "cluster clear".',
	schema: z.object({
		plan: z
			.array(
				z.object({
					action: z.string().describe('API action name, e.g. help, callHelicopter'),
					params: z.string().nullable().describe('JSON-encoded params object, e.g. {"position":"A7"}'),
				})
			)
			.describe('Cluster mission array of API actions to execute in order: [{action: string, params?: object}]'),
		apiHelp: z
			.string()
			.describe(
				'Raw API help response text to include in the cluster agent prompt so it can understand the API it can use'
			),
	}),
	strict: true,
	handler: async (plan) => runClusterAgent(JSON.stringify(plan)),
})
