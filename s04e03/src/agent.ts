import OpenAI from 'openai'
import { config } from './config'
import { ORCHESTRATOR_SYSTEM_PROMPT, ORCHESTRATOR_USER_PROMPT } from './prompts'
import { agentTools, toolDefinitions } from './types'
import { printSummary } from './stats'
import { runAgentLoop } from './agent-loop'

const MAX_ITERATIONS = 40

export async function runOrchestrator(): Promise<void> {
	const client = new OpenAI({
		apiKey: config.openaiApiKey,
		baseURL: config.openaiBaseUrl,
	})

	const conversation = await client.conversations.create({
		items: [
			{ role: 'system', content: ORCHESTRATOR_SYSTEM_PROMPT },
			{ role: 'user', content: ORCHESTRATOR_USER_PROMPT },
		],
	})

	console.log(`available tools: ${toolDefinitions.map((t) => t.type).join(', ')}`)

	await runAgentLoop({
		client,
		conversationId: conversation.id,
		toolDefinitions,
		agentTools,
		maxIterations: MAX_ITERATIONS,
		model: config.orchestratorModel,
		temperature: config.openaiTemperature,
		logPrefix: 'Orchestrator',
		defaultToolChoice: 'required',
		compactionThreshold: 50000,
		reasoningEffort: 'low',
	})

	printSummary('MAX ITERATIONS REACHED')
	process.exit(1)
}
