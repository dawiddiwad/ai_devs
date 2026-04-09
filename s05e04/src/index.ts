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
	logger.agent('info', 'Starting task', { task: config.taskName })
	await runAgent(config, {
		api: 'responses',
		tools,
		observability,
		systemPrompt: SYSTEM_PROMPT,
		userPrompt: USER_PROMPT,
		maxIterations: 100,
		toolChoice: 'required',
		reasoning: { effort: 'low' },
		handleNoToolCalls: (context) => ({
			action: 'continue',
			input: [
				...context.input,
				{
					role: 'user',
					content: 'Continue using the available tools until the flag is captured. Do not stop early.',
				},
			],
		}),
	})
}

main().catch((error) => {
	logger.agent('error', 'Unhandled error', {
		error: error instanceof Error ? error.message : String(error),
	})
	process.exit(1)
})
