---
description: 'Use when implementing OpenAI Responses API calls, agent loops, tool-calling agents, or defineTool bundled tools.'
paths:
  - '**/src/agent.ts'
  - '**/src/tools.ts'
  - '**/src/tools/**'
  - '**/src/tool-factory.ts'
  - '**/src/types.ts'
---

# OpenAI SDK Patterns (v6 · Responses API)

## Imports

```ts
import OpenAI from 'openai'
import type { FunctionTool, Tool, ResponseInput } from 'openai/resources/responses/responses'
import { z } from 'zod/v4'
```

## Bundled Tool Pattern

`src/tool-factory.ts` is part of the template — do not redefine it. It exports `defineTool()` (returns `AgentTool`) and the `AgentTool` interface. Use it directly.

### Tool file (one per tool)

```ts
import { z } from 'zod/v4'
import { defineAgentTool } from '../tool-factory'

export const myTool = defineAgentTool({
	name: 'my_tool',
	description: '...',
	schema: z.object({
		param: z.string().describe('Description of param'),
	}),
	handler: async ({ param }) => {
		// fully typed args — no manual safeParse needed
		return JSON.stringify({ result: param })
	},
})
```

### types.ts — thin registry

```ts
import { Tool } from 'openai/resources/responses/responses'
import { AgentTool } from './tool-factory'
import { myTool } from './tools/my-tool'

export const agentTools: AgentTool[] = [myTool]

export const toolDefinitions = [
	...agentTools.map((t) => t.definition),
	{ type: 'code_interpreter', container: { type: 'auto', memory_limit: '1g' } },
] satisfies Tool[]
```

## Agent Loop Pattern (Conversations + Responses API)

```ts
const conversation = await client.conversations.create({
	items: [
		{ role: 'system', content: SYSTEM_PROMPT },
		{ role: 'user', content: USER_PROMPT },
	],
})

let inputMessages: ResponseInput = []
for (let i = 0; i < MAX_ITERATIONS; i++) {
	const response = await client.responses.create({
		model: config.openaiModel,
		conversation: conversation.id,
		tools: toolDefinitions,
		tool_choice: 'required',
		temperature: config.openaiTemperature,
		input: inputMessages,
		reasoning: { effort: config.openaiReasoningEffort },
		context_management: [{ type: 'compaction', compact_threshold: 100000 }],
	})
	inputMessages = []
	for (const item of response.output) {
		if (item.type === 'message') {
			logger.agent('info', 'Agent message', { content: item.content })
		}
		if (item.type === 'code_interpreter_call') {
			logger.tool('info', 'Code interpreter call', { codeLength: item.code?.length })
		}
		if (item.type === 'function_call') {
			logger.agent('info', `Tool call: ${item.name}`)
			try {
				const tool = agentTools.find((t) => t.definition.name === item.name)
				const result = tool
					? await tool.execute(JSON.parse(item.arguments))
					: JSON.stringify({ error: `Unknown tool: ${item.name}` })
				inputMessages.push({ type: 'function_call_output', call_id: item.call_id, output: result })
			} catch (error) {
				inputMessages.push({
					type: 'function_call_output',
					call_id: item.call_id,
					output: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
				})
			}
		}
	}
}
```

## Error Handling

- Tool errors: catch and return as JSON `{ error: message }` in tool response (never throw from executors)
- API calls to verify: always use `validateStatus: () => true` to capture error feedback
- Top-level: `main().catch(e => { logger.agent('error', '...', { error: e }); process.exit(1) })`
