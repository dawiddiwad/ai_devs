---
description: 'Use when implementing OpenAI API calls, agent loops, tool-calling agents, structured output, vision API, ChatCompletion types, or Zod function tools.'
applyTo: '**/src/agent.ts, **/src/tools.ts, **/src/tools/**'
---

# OpenAI SDK Patterns (v6)

## Types

```ts
import OpenAI from 'openai'
import type { ChatCompletionMessageParam, ChatCompletionTool } from 'openai/resources/chat/completions'
```

## Tool Definitions

Always use `ChatCompletionTool` type. Validate args with Zod:

```ts
const toolDefinitions: ChatCompletionTool[] = [
	{
		type: 'function',
		function: {
			name: 'tool_name',
			description: '...',
			parameters: {
				type: 'object',
				properties: {
					/* ... */
				},
				required: ['...'],
			},
		},
	},
]
```

## Tool Call Type Narrowing

v6 tool calls are a union type. Always narrow:

```ts
if (toolCall.type !== 'function') continue
```

## Structured Output (preferred for new code)

Use `zodFunction` from `openai/helpers/zod` + `client.chat.completions.parse()`:

```ts
import { zodFunction } from 'openai/helpers/zod'
import { z } from 'zod/v4'

const tool = zodFunction({
	name: 'decide',
	parameters: MySchema,
	description: '...',
})

const response = await client.chat.completions.parse({
	model,
	messages,
	tools: [tool],
	tool_choice: 'required',
})
const parsed = response.choices[0].message.tool_calls?.[0].function.parsed_arguments
```

## Agent Loop Pattern

```ts
for (let i = 0; i < MAX_ITERATIONS; i++) {
	const response = await client.chat.completions.create({
		model: config.openaiModel,
		messages,
		tools: toolDefinitions,
	})
	const message = response.choices[0].message
	messages.push(message)

	if (!message.tool_calls?.length) break

	for (const toolCall of message.tool_calls) {
		if (toolCall.type !== 'function') continue
		try {
			const result = await executeTool(toolCall.function.name, JSON.parse(toolCall.function.arguments))
			messages.push({ role: 'tool', tool_call_id: toolCall.id, content: result })
		} catch (error) {
			messages.push({
				role: 'tool',
				tool_call_id: toolCall.id,
				content: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
			})
		}
	}
}
```

## Tool Executor Pattern

Prefer executor map over switch statements for reusability:

```ts
const toolExecutors: Record<string, (args: unknown) => Promise<string>> = {
	tool_name: async (args) => {
		/* ... */
	},
}
```

## Error Handling

- Tool errors: catch and return as JSON `{ error: message }` in tool response
- API calls to verify: always use `validateStatus: () => true` to capture error feedback
- Top-level: `main().catch(e => { logger.agent('error', '...', { error: ... }); process.exit(1) })`
