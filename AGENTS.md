# Repository Guidelines

## Scope

- This file applies at the repository root.
- If you work inside a task folder that has its own `AGENTS.md` or `CLAUDE.md`, treat the more local file as an additional constraint for that subtree.
- At the time this file was written, there were no Cursor rules in `.cursor/rules/`, no `.cursorrules`, and no Copilot instructions in `.github/copilot-instructions.md`.

## Repository Shape

- This is a pnpm workspace monorepo.
- Workspace packages live in `packages/*`, `template`, and `s*`.
- `packages/core` is the shared library published as `@ai-devs/core`.
- `template` is the scaffold for new tasks.
- `sXXeYY` folders are task-specific apps, usually TypeScript CLIs built on top of `@ai-devs/core`.

## Tooling Stack

- Node.js 20+
- pnpm
- TypeScript
- ESLint 9 flat config
- Prettier 3
- OpenAI SDK v6
- Zod v4

## Command Strategy

- Prefer running commands from the repo root with `pnpm --filter <package> ...`.
- Package-local `npm run ...` scripts exist, but workspace automation should prefer `pnpm --filter`.
- `packages/core` is the cleanest reference package for scripts and conventions.

## Root Commands

Run from the repo root:

```bash
pnpm install
pnpm build:core
pnpm dev:core
```

`npm run build:core` also works, but npm prints warnings because root `.npmrc` contains pnpm-specific settings. Treat those as workspace noise, not build failures.

## Package Commands

Core package:

```bash
pnpm --filter @ai-devs/core run build
pnpm --filter @ai-devs/core run dev
pnpm --filter @ai-devs/core run compile:check
pnpm --filter @ai-devs/core run lint:check
pnpm --filter @ai-devs/core run lint:fix
pnpm --filter @ai-devs/core run format:check
pnpm --filter @ai-devs/core run format:fix
```

Task package example:

```bash
pnpm --filter s04e05 run build
pnpm --filter s04e05 run compile:check
pnpm --filter s04e05 run lint:check
pnpm --filter s04e05 run format:check
pnpm --filter s04e05 run dev
```

## Test Commands

- There is no standardized test runner configured at the workspace level.
- There are currently no checked-in `*.test.*` or `*.spec.*` files.
- In practice, validation is done with typecheck, lint, format check, and build.

Default verification sequence:

```bash
pnpm --filter <package> run compile:check
pnpm --filter <package> run lint:check
pnpm --filter <package> run format:check
pnpm --filter <package> run build
```

### Single Test Guidance

- There is no repository-wide single-test command because there is no active test framework configured.
- If a package adds tests later, inspect that package’s `package.json` first.
- Until then, the nearest equivalent to “single test” is a single package check, for example:

```bash
pnpm --filter @ai-devs/core run compile:check
pnpm --filter s04e05 run compile:check
pnpm --filter @ai-devs/core exec eslint src/run-agent.ts
pnpm --filter s04e05 exec eslint src/index.ts
```

## Build Expectations

- `build` usually means typecheck + lint + format check + `tsc` emit.
- Do not assume `build` is a fast compile-only step.
- Prefer the narrowest package build that covers your change.

## Code Style

- Use TypeScript.
- Use English names for variables, functions, files, and types.
- Do not use semicolons.
- Avoid inline comments unless they add real value.
- Prefer self-explanatory code over explanatory comments.
- Keep files logically modular; avoid monolithic `index.ts` files.
- Favor small, explicit helpers over clever abstractions.

## Imports

- Use ESM-style imports.
- Use `import type` for type-only imports.
- For local TypeScript imports, include the `.js` suffix.

Example:

```ts
import { logger } from './logger.js'
import type { AgentConfig } from './types.js'
```

- In task packages, import shared infrastructure from `@ai-devs/core` instead of duplicating helpers.
- Do not create local `config`, `logger`, `tool-factory`, or verification utilities when the core package already provides them.

## Formatting and Linting

- Prettier is authoritative for formatting.
- ESLint flat config is used across the repo.
- Ignore generated output such as `dist/`.
- Before finishing non-trivial work, run at least `format:check` and `lint:check` for the affected package.

## Types and Naming

- Prefer explicit types at module boundaries.
- Use discriminated unions when API modes differ meaningfully.
- Keep exported types readable; avoid deep conditional-type cleverness when a union is clearer.
- Use `unknown` rather than `any` unless there is a strong reason not to.
- Validate external input with Zod where applicable.
- Use `camelCase` for variables/functions and `PascalCase` for types/interfaces.
- Prefer descriptive names and useful suffixes such as `Context`, `Result`, `Config`, and `Tool`.

## Error Handling

- Fail fast on missing required environment variables.
- Normalize unknown errors with:

```ts
const errorMessage = error instanceof Error ? error.message : String(error)
```

- Log operational failures through `logger.agent(...)`, `logger.tool(...)`, or `logger.api(...)`.
- In CLI entry points, use this pattern:

```ts
main().catch((error) => {
  logger.agent('error', 'Unhandled error', {
    error: error instanceof Error ? error.message : String(error),
  })
  process.exit(1)
})
```

## Core Library Conventions

- Prefer `createConfig()` for env loading.
- Add custom env fields through `createConfig({ requiredEnv, optionalEnv, overrides })`.
- Use `runAgent()` for standard agent loops.
- Use `defineAgentTool()` for tools and return string payloads from tool handlers.
- Use `verifyAnswer()` and `captureFlag()` from `@ai-devs/core`; do not reimplement flag parsing with LLM logic.

## Task Package Structure

Expected shape:

```text
sXXeYY/
├── spec.md
├── .env
└── src/
    ├── index.ts
    ├── prompts.ts
    └── tools/
        ├── index.ts
        └── verify.ts
```

- Keep `src/index.ts` thin.
- Put prompts in `src/prompts.ts`.
- Put one tool per file under `src/tools/`.
- Update `spec.md` when behavior changes in a task package.

## Practical Workflow For Agents

1. Read the local package `package.json` before running commands.
2. Check for a more local `AGENTS.md` or `CLAUDE.md` in the subtree you are editing.
3. Make the smallest correct change.
4. Run package-scoped checks.
5. Prefer package-local verification over workspace-wide commands unless the change is cross-cutting.
