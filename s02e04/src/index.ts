import { config } from './config'
import { logger } from './logger'
import { runAgent } from './agents/runner'
import { coordinatorSystemPrompt } from './agents/coordinator'
import { coordinatorTools } from './tools/definitions'
import { delegate } from './tools/delegate'
import { submitAnswer } from './tools/hub'
import { finish } from './tools/finish'

async function main() {
	logger.agent('info', 'Starting mailbox agent', { model: config.openaiModel })

	const coordinatorToolExecutors: Record<string, (args: unknown) => Promise<string> | never> = {
		delegate,
		submitAnswer,
		finish: (args: unknown) => finish(args),
	}

	const agentConfig = {
		systemPrompt: coordinatorSystemPrompt,
		tools: coordinatorTools,
		toolExecutors: coordinatorToolExecutors,
	}

	const taskMessage = `Begin the mailbox investigation. Find all three values (date, password, confirmation_code) by delegating to the specialized finder agents, then submit the answer to capture the flag. Each finder agent has full knowledge of the mailbox API and will handle retries autonomously.`

	await runAgent(agentConfig, taskMessage)

	logger.agent('error', 'Agent completed without capturing a flag')
	process.exit(1)
}

main().catch((error) => {
	logger.agent('error', 'Fatal error', { error: error instanceof Error ? error.message : String(error) })
	process.exit(1)
})
