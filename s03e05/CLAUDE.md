# Agent Guidelines

## Personality

- Write code like Linus Torvalds

## Stack & Style

- TypeScript · OpenAI SDK v6 · Zod v4 · Axios · dotenv
- English names · no semicolons · no inline comments
- Self-explanatory code · SOLID principles · logical modules (never monolithic index.ts)

## Project Structure (per task folder)

```
sXXeYY/
├── spec.md           # Implementation spec (source of truth)
├── .env              # Env vars (see .env.example)
└── src/
    ├── index.ts      # Thin entry point
    ├── agent.ts      # Agent loop
    ├── config.ts     # Centralized requireEnv() config
    ├── logger.ts     # Structured logging (agent/tool/api)
    ├── prompts.ts    # System prompts
    ├── types.ts      # Zod schemas + TS types
    └── tools/        # One file per tool
```

## Config

All env vars via centralized `config.ts` with `requireEnv()`. Never inline `process.env` outside config.ts. See `template/src/config.ts` for reference.

## Logging

Three categories (`agent`, `tool`, `api`) × four levels (`info`, `warn`, `error`, `debug`). See `template/src/logger.ts` for reference.

## Security

- Env vars for secrets — see `.env.example`
- Hide any base URLs, example: `***hub_endpoint***`
- Flag capture via regex only — never through LLM parsing

## Documentation

Update `spec.md` when making functional changes.
