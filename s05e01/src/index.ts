import { createConfig, createLangfuseObservability, logger, runAgent } from '@ai-devs/core'
import { SYSTEM_PROMPT, USER_PROMPT } from './prompts'
import { tools } from './tools/index'

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
	logger.agent('info', 'Starting radiomonitoring session', { task: config.taskName })

	await fetch(config.verifyEndpoint, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			apikey: config.aiDevsApiKey,
			task: config.taskName,
			answer: { action: 'start' },
		}),
	})

	logger.agent('info', 'Session started, launching agent')

	await runAgent(config, {
		api: 'completions',
		tools,
		systemPrompt: SYSTEM_PROMPT,
		userPrompt: USER_PROMPT,
		maxIterations: 50,
		serviceTier: 'flex',
		observability,
		handleNoToolCalls: (context) => {
			return {
				action: 'continue',
				messages: [
					...context.messages,
					{
						role: 'user',
						content:
							'No tools were called, but the task is not complete. Please continue. You are doing great!',
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
