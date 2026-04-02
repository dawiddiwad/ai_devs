# Architecture Patterns

## Module Implementation Order

prompts.ts → tools/ → index.ts

All infrastructure (config, logger, tool-factory, agent runner, verify) comes from `@ai-devs/core`.

## index.ts — Thin Entry Point

```ts
import { createConfig, logger, runAgent } from '@ai-devs/core'
import { SYSTEM_PROMPT, USER_PROMPT } from './prompts.js'
import { tools } from './tools/index.js'

const config = createConfig()

async function main() {
	logger.agent('info', 'Starting task', { task: config.taskName })
	await runAgent(config, {
		api: 'responses',
		tools,
		systemPrompt: SYSTEM_PROMPT,
		userPrompt: USER_PROMPT,
	})
}

main().catch((error) => {
	logger.agent('error', 'Unhandled error', {
		error: error instanceof Error ? error.message : String(error),
	})
	process.exit(1)
})
```

## prompts.ts — System & User Prompts

Export `SYSTEM_PROMPT` and `USER_PROMPT` as strings. Keep prompts here, not inline in index.ts.

## tools/ — One File Per Tool

Each file exports one `AgentTool` via `defineAgentTool()` from `@ai-devs/core`.
`tools/index.ts` exports the `tools` array.

```ts
import { z } from 'zod/v4'
import { defineAgentTool } from '@ai-devs/core'

export const myTool = defineAgentTool({
	name: 'my_tool',
	description: '...',
	schema: z.object({ param: z.string() }),
	handler: async ({ param }) => JSON.stringify({ result: param }),
})
```

## Verify/Submit Tool

Use `verifyAnswer()` from `@ai-devs/core` — handles POST, flag capture, exit automatically.
See `template/src/tools/verify.ts` for the standard pattern.

## runAgent() Options

```ts
await runAgent(config, {
	api: 'responses',             // 'responses' | 'completions'
	tools,                        // AgentTool[]
	systemPrompt: SYSTEM_PROMPT,
	userPrompt: USER_PROMPT,
	maxIterations: 20,            // default: 20
	model: 'gpt-5',              // overrides config.openaiModel
	reasoning: { effort: 'high' }, // responses API only
	toolChoice: 'auto',           // 'auto' | 'required' | 'none'
	exitOnFlag: true,             // default: true
	onToolCall: (name, args, result) => { ... },  // optional hook
	onMessage: (content) => { ... },               // optional hook
})
```

## Escape Hatch — Custom Agent Loops

For HTTP servers, multi-agent orchestration, or batch pipelines, skip `runAgent` and import individual utilities:

```ts
import { createConfig, logger, createOpenAIClient, defineAgentTool, captureFlag } from '@ai-devs/core'
```

## Task-Specific Config

Extend standard config with task-specific env vars:

```ts
import { createConfig, requireEnv } from '@ai-devs/core'
const config = { ...createConfig(), okoUrl: requireEnv('OKO_URL') }
```

## Common Anti-Patterns to Avoid

- Creating local config.ts, logger.ts, or tool-factory.ts — use `@ai-devs/core`
- `@types/axios` in devDeps — axios v1+ ships own types
- Parallel tool execution via `Promise.all` — use sequential
- Type narrowing via `as` casts in tool args — use Zod `.safeParse()`
- Hardcoded package.json name from template — update per task
- `import 'dotenv/config'` — use `createConfig()` instead
- Building custom agent loops when `runAgent()` suffices
