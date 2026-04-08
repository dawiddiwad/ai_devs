import { createConfig, logger, runAgent } from '@ai-devs/core'
import { SYSTEM_PROMPT, USER_PROMPT } from './prompts.js'
import { tools } from './tools/index.js'

const config = createConfig()

async function main() {
	logger.agent('info', 'Starting shellaccess agent', {
		task: config.taskName,
		model: config.openaiModel,
	})

	await runAgent(config, {
		api: 'responses',
		tools,
		systemPrompt: SYSTEM_PROMPT,
		userPrompt: USER_PROMPT,
		maxIterations: 50,
		reasoning: {
			effort: 'medium',
		},
		handleNoToolCalls: (context) => {
			return {
				action: 'continue',
				input: [
					...context.input,
					{
						role: 'user',
						content:
							'No tool was called and the task is not complete. Continue investigating /data with run_remote_command. Use only read-only commands until the final JSON-printing command.',
					},
				],
			}
		},
	})
}

main().catch((error) => {
	logger.agent('error', 'Unhandled error', {
		error: error instanceof Error ? error.message : String(error),
	})
	process.exit(1)
})
