import OpenAI from 'openai'
import type { Tool } from 'openai/resources/responses/responses'
import { config } from './config'
import { CLUSTER_AGENT_SYSTEM_PROMPT } from './prompts'
import { callApiTool } from './tools/call-api'
import { createFinishTool } from './tools/finish'
import { runAgentLoop } from './agent-loop'
import { logger } from './logger'

const MAX_CLUSTER_ITERATIONS = 30

export async function runClusterAgent(plan: string): Promise<string> {
	const client = new OpenAI({
		apiKey: config.openaiApiKey,
		baseURL: config.openaiBaseUrl,
	})

	let finalSummary: string | null = null
	const finishTool = createFinishTool((summary) => {
		finalSummary = summary
	})

	const agentTools = [callApiTool, finishTool]
	const toolDefinitions = agentTools.map((t) => t.definition) satisfies Tool[]

	const conversation = await client.conversations.create({
		items: [
			{ role: 'system', content: CLUSTER_AGENT_SYSTEM_PROMPT(plan) },
			{ role: 'user', content: 'execute all actions in the provided plan in sequence' },
		],
	})

	const lastMessage = await runAgentLoop({
		client,
		conversationId: conversation.id,
		toolDefinitions,
		agentTools,
		maxIterations: MAX_CLUSTER_ITERATIONS,
		model: config.clusterAgentModel,
		temperature: config.openaiTemperature,
		logPrefix: 'Cluster',
		lastIterationTool: 'finish',
		shouldStop: () => finalSummary !== null,
		reasoningEffort: 'low',
		compactionThreshold: 50_000,
	})

	if (finalSummary !== null) {
		logger.agent('info', `Cluster done: ${finalSummary}`)
		return finalSummary
	}

	logger.agent('warn', 'Cluster hit max iterations')
	return lastMessage || 'cluster clear'
}
