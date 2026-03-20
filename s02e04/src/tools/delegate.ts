import { logger } from '../logger'
import { delegateSchema, finderTools } from './definitions'
import { emailRequest, wait } from './mailbox'
import { runAgent, AgentConfig } from '../agents/runner'
import { finderSystemPrompt } from '../agents/finder'

const finderToolExecutors: Record<string, (args: unknown) => Promise<string>> = {
	email_request: emailRequest,
	wait,
}

export async function delegate(args: unknown): Promise<string> {
	const parsed = delegateSchema.parse(args)
	const { instruction } = parsed

	logger.agent('info', 'Spawning finder agent', { instruction })

	const agentConfig: AgentConfig = {
		systemPrompt: finderSystemPrompt,
		tools: finderTools,
		toolExecutors: finderToolExecutors,
	}

	const result = await runAgent(agentConfig, instruction)

	logger.agent('info', 'Finder agent result', { result: result.substring(0, 500) })
	return JSON.stringify({ result })
}
