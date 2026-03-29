# Architecture Patterns

## Module Implementation Order

config.ts → types.ts → logger.ts → tool-factory.ts → tools/ → prompts.ts → agent.ts → index.ts

## index.ts — Thin Entry Point

```ts
import { config } from './config'
import { logger } from './logger'
import { runAgent } from './agent'

async function main() {
	logger.agent('info', 'Starting task', { task: config.taskName })
	await runAgent()
}

main().catch((error) => {
	logger.agent('error', 'Unhandled error', {
		error: error instanceof Error ? error.message : String(error),
	})
	process.exit(1)
})
```

## config.ts — Centralized Config

Use `requireEnv()` for required vars, `process.env['X'] || default` for optional.
Extend with task-specific vars as needed. Reference: `template/src/config.ts`.

## logger.ts — Structured Logging

API: `logger.agent('info', 'message', { optional: 'context' })`
Categories: `agent` (decisions), `tool` (execution), `api` (external calls).
Reference: `template/src/logger.ts`.

## agent.ts — Agent Loop

Uses Responses API with stateful conversations:

- Create conversation once with `client.conversations.create({ items: [system, user] })`
- Each iteration: `client.responses.create({ conversation: id, input: inputMessages, tools, tool_choice: 'required' })`
- Accept `MAX_ITERATIONS` constant (typically 15-30)
- Process `response.output` items by type: `message`, `function_call`, `code_interpreter_call`
- On tool error: catch and push `{ error: message }` as `function_call_output`

## tool-factory.ts — Bundled Tool Utility

Provides `defineTool()` — co-locates Zod schema, OpenAI function definition, and handler:

```ts
export const myTool = defineTool({
	name: 'my_tool',
	description: '...',
	schema: z.object({ param: z.string() }),
	handler: async ({ param }) => JSON.stringify({ result: param }),
})
```

`z.toJSONSchema()` derives the OpenAI JSON schema from Zod (strip `$schema` key). Handler receives typed args — no manual `safeParse` needed.

## tools/ — One File Per Tool

Each file exports one `BoundTool` via `defineTool()`.
`types.ts` exports `boundTools[]` and derives `toolDefinitions` from it.
Agent dispatches by matching `item.name` against `boundTools` — no separate executor registry.

## Verify/Submit Tool

- Always use `validateStatus: () => true` on axios POST
- Parse response for flag with `FLAG_REGEX`
- Return full response text even on HTTP errors — contains feedback

## Common Anti-Patterns to Avoid

- `@types/axios` in devDeps — axios v1+ ships own types
- Parallel tool execution via `Promise.all` — use sequential
- Type narrowing via `as` casts in tool args — use Zod `.safeParse()`
- Hardcoded package.json name from template — update per task
- `import 'dotenv/config'` — use centralized `config.ts` instead
