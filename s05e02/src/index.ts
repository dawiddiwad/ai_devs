import { createConfig, createLangfuseObservability, logger, runAgent } from '@ai-devs/core'
import { SYSTEM_PROMPT, USER_PROMPT } from './prompts.js'
import { tools } from './tools/index.js'

const config = createConfig({
	optionalEnv: {
		langfusePublicKey: 'LANGFUSE_PUBLIC_KEY',
		langfuseSecretKey: 'LANGFUSE_SECRET_KEY',
		langfuseBaseUrl: { name: 'LANGFUSE_BASE_URL', fallback: 'https://cloud.langfuse.com' },
	},
})
const observability =
	config.langfusePublicKey && config.langfuseSecretKey
		? createLangfuseObservability({
				publicKey: config.langfusePublicKey,
				secretKey: config.langfuseSecretKey,
				baseUrl: config.langfuseBaseUrl,
				traceName: `task:${config.taskName}-${Date.now()}`,
				metadata: { task: config.taskName },
				sessionId: `task:${config.taskName}`,
			})
		: undefined

async function main() {
	logger.agent('info', 'Starting phonecall agent', {
		task: config.taskName,
		model: config.openaiModel,
	})

	await runAgent(config, {
		api: 'completions',
		tools,
		systemPrompt: SYSTEM_PROMPT,
		userPrompt: USER_PROMPT,
		maxIterations: 20,
		toolChoice: 'required',
		observability,
		handleNoToolCalls: (context) => {
			return {
				action: 'continue',
				messages: [
					...context.messages,
					{
						role: 'user',
						content:
							'No tool was called and the phone operation is not complete. If the call is not started, call start_call. If the call burned, restart it. Otherwise continue with the next short Polish utterance.',
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
