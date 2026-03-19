import { logger } from '../logger'
import { delegateSchema, finderTools } from './definitions'
import { getInbox, getThread, getMessages, search, wait, helpMail } from './mailbox'
import { runAgent, AgentConfig } from '../agents/runner'
import { dateFinderSystemPrompt } from '../agents/dateFinder'
import { passwordFinderSystemPrompt } from '../agents/passwordFinder'
import { codeFinderSystemPrompt } from '../agents/codeFinder'

const finderToolExecutors: Record<string, (args: unknown) => Promise<string>> = {
	getInbox,
	getThread,
	getMessages,
	search,
	wait,
	help: () => helpMail(),
}

const agentConfigs: Record<string, AgentConfig> = {
	dateFinder: {
		systemPrompt: dateFinderSystemPrompt,
		tools: finderTools,
		toolExecutors: finderToolExecutors,
	},
	passwordFinder: {
		systemPrompt: passwordFinderSystemPrompt,
		tools: finderTools,
		toolExecutors: finderToolExecutors,
	},
	confirmationCodeFinder: {
		systemPrompt: codeFinderSystemPrompt,
		tools: finderTools,
		toolExecutors: finderToolExecutors,
	},
}

export async function delegate(args: unknown): Promise<string> {
	const parsed = delegateSchema.parse(args)
	const { agentType, context } = parsed

	logger.agent('info', `Delegating to ${agentType}`, { context })

	const agentConfig = agentConfigs[agentType]
	if (!agentConfig) {
		throw new Error(`Unknown agent type: ${agentType}`)
	}

	const userMessage = context || `Find the required value by searching through the mailbox.`
	const result = await runAgent(agentConfig, userMessage)

	logger.agent('info', `Delegation result from ${agentType}`, { result: result.substring(0, 500) })
	return JSON.stringify({ result })
}
