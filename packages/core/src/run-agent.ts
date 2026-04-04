import { logger } from './logger.js'
import { createOpenAIClient } from './openai-client.js'
import { runCompletionsLoop } from './completions-loop.js'
import { runResponsesLoop } from './responses-loop.js'
import type { AgentConfig, AgentResult, CoreConfig } from './types.js'

export async function runAgent(coreConfig: CoreConfig, agentConfig: AgentConfig): Promise<AgentResult> {
	const client = createOpenAIClient(coreConfig)
	const model = agentConfig.model ?? coreConfig.openaiModel
	const maxIterations = agentConfig.maxIterations ?? 20
	const temperature = agentConfig.temperature ?? coreConfig.openaiTemperature

	logger.agent('info', 'Starting agent', {
		api: agentConfig.api,
		model,
		maxIterations,
		toolCount: agentConfig.tools.length,
	})

	if (agentConfig.api === 'responses') {
		return runResponsesLoop(client, model, maxIterations, temperature, agentConfig)
	}

	return runCompletionsLoop(client, model, maxIterations, temperature, agentConfig)
}
