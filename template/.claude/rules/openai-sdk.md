---
description: 'Use when implementing OpenAI API calls, agent loops, tool-calling agents, or defineAgentTool bundled tools.'
paths:
  - '**/src/tools/**'
  - '**/src/index.ts'
  - '**/src/prompts.ts'
---

# OpenAI SDK Patterns (v6 · @ai-devs/core)

## Imports

All utilities come from `@ai-devs/core`:

```ts
import { createConfig, logger, runAgent, defineAgentTool, verifyAnswer, createOpenAIClient } from '@ai-devs/core'
import type { AgentTool, AgentConfig } from '@ai-devs/core'
import { z } from 'zod/v4'
```

Do NOT import OpenAI directly unless building a custom agent loop. Do NOT create local tool-factory.ts, config.ts, or logger.ts.

## Tool Definition (one file per tool)

```ts
import { z } from 'zod/v4'
import { defineAgentTool } from '@ai-devs/core'

export const myTool = defineAgentTool({
	name: 'my_tool',
	description: '...',
	schema: z.object({
		param: z.string().describe('Description of param'),
	}),
	handler: async ({ param }) => {
		return JSON.stringify({ result: param })
	},
})
```

## Tool Registry (tools/index.ts)

```ts
import type { AgentTool } from '@ai-devs/core'
import { verifyTool } from './verify.js'
import { myTool } from './my-tool.js'

export const tools: AgentTool[] = [verifyTool, myTool]
```

## Agent Loop — Standard (via runAgent)

```ts
import { createConfig, runAgent } from '@ai-devs/core'

const config = createConfig()

await runAgent(config, {
	api: 'responses',        // or 'completions'
	tools,
	systemPrompt: SYSTEM_PROMPT,
	userPrompt: USER_PROMPT,
	maxIterations: 20,       // default: 20
	reasoning: { effort: 'medium' },  // responses API only
	toolChoice: 'auto',      // 'auto' | 'required' | 'none'
})
```

`runAgent` handles: conversation creation, tool dispatch, flag scanning, logging, and `process.exit(0)` on flag capture.

## Agent Loop — Custom (escape hatch)

For HTTP servers, multi-agent, or non-standard flows, import individual utilities:

```ts
import { createConfig, logger, createOpenAIClient, defineAgentTool } from '@ai-devs/core'

const client = createOpenAIClient(config)
// Wire your own conversation/responses loop
```

## Multi-Agent Pattern

Nest `runAgent` calls with `exitOnFlag: false` for sub-agents:

```ts
const subResult = await runAgent(config, {
	api: 'responses',
	model: 'gpt-5-mini',
	tools: subTools,
	systemPrompt: SUB_PROMPT,
	userPrompt: task,
	exitOnFlag: false,
})
return subResult.finalMessage
```

## Error Handling

- Tool errors: catch and return as JSON `{ error: message }` (never throw from handlers)
- API calls to verify: use `verifyAnswer()` from core — handles `validateStatus: () => true` automatically
- Top-level: `main().catch(e => { logger.agent('error', '...', { error: e }); process.exit(1) })`
