# Agent Guidelines

## Personality

- Write code like Linus Torvalds

## Stack & Style

- TypeScript · OpenAI SDK v6 · Zod v4 · @ai-devs/core
- English names · no semicolons · no inline comments
- Self-explanatory code · SOLID principles · logical modules (never monolithic index.ts)

## Project Structure (per task folder)

```
sXXeYY/
├── spec.md           # Implementation spec (source of truth)
├── .env              # Env vars (see .env.example)
└── src/
    ├── index.ts      # Thin entry: import from @ai-devs/core, wire prompts+tools, run
    ├── prompts.ts    # System/user prompts
    └── tools/        # One file per tool using defineAgentTool from @ai-devs/core
        ├── index.ts  # Tool registry array
        └── verify.ts # Standard verify tool
```

## Imports

All from `@ai-devs/core`: `createConfig`, `logger`, `runAgent`, `defineAgentTool`, `verifyAnswer`, `captureFlag`, `createOpenAIClient`, `requireEnv`, `optionalEnv`

Do NOT create local config.ts, logger.ts, or tool-factory.ts — these live in @ai-devs/core.

## Config

Use `createConfig()` for standard vars. Add task-specific env vars inline when needed:

```ts
const config = createConfig({
	requiredEnv: {
		customVar: 'CUSTOM_VAR',
	},
	optionalEnv: {
		region: { name: 'REGION', fallback: 'eu' },
	},
})
```

## Logging

Same API: `logger.agent('info', 'message', { optional: 'context' })`
Categories: `agent`, `tool`, `api` · Levels: `info`, `warn`, `error`, `debug`

## Agent Runner

Use `runAgent()` from @ai-devs/core — supports both `'responses'` and `'completions'` API modes:

```ts
await runAgent(config, {
	api: 'responses',
	tools,
	systemPrompt: SYSTEM_PROMPT,
	userPrompt: USER_PROMPT,
	reasoning: { effort: 'low' },
})
```

For custom agent behavior (HTTP servers, multi-agent), import individual utilities and wire your own loop.

## Security

- Env vars for secrets — see `.env.example`
- Hide any base URLs, example: `***hub_endpoint***`
- Flag capture via regex only — never through LLM parsing

## Documentation

Update `spec.md` when making functional changes.
