# Observability

Langfuse tracing is optional and explicit.

```ts
import { createConfig, createLangfuseObservability, runAgent } from '@ai-devs/core'

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
				traceName: `task:${config.taskName}`,
				metadata: { task: config.taskName },
			})
		: undefined

await runAgent(config, {
	api: 'responses',
	tools,
	systemPrompt: SYSTEM_PROMPT,
	userPrompt: USER_PROMPT,
	observability,
})
```
