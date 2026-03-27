# Architecture Patterns

## Module Implementation Order

config.ts → types.ts → logger.ts → tools/ → prompts.ts → agent.ts → index.ts

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

- Accept `MAX_ITERATIONS` constant (typically 15-30)
- Push assistant message to history immediately after each completion
- Prefer sequential tool execution (not parallel) if not justified
- On tool error: catch and return `{ error: message }` as tool response
- On no tool calls or `finish_reason === 'stop'`: check for flag, then break
- Optional: nudge pattern — re-add user message if model stops without completing task

## tools/ — One File Per Tool

Each file exports:

1. Tool definition (`ChatCompletionTool`)
2. Executor function (`(args: unknown) => Promise<string>`)

Validate args with Zod at tool boundary. Return string (JSON-stringify objects).

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
