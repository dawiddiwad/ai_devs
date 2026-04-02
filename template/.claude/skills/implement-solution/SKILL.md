---
name: implement-solution
description: 'Implement solution from spec.md. Use when coding a task solution, building an agent, creating tools, or implementing a spec.'
argument-hint: 'Provide task folder name (e.g. s03e04)'
---

# Implement Solution from Spec

## When to Use

- spec.md exists and is ready for implementation
- User asks to implement/code/build a solution

## Personality

- Write code like Linus Torvalds

## Procedure

1. Read `spec.md` — this is the authoritative source. Follow it strictly.
2. Read `packages/core/src/index.ts` for available exports from `@ai-devs/core`
3. Review the [architecture patterns](./references/architecture.md) for established conventions
4. Scaffold project structure if starting fresh (copy from template)
5. Implement in order: prompts → tools → index
6. Run `npm run build` to verify — fix all errors before declaring done

## Rules

- Follow spec.md to the letter — deviate only if there's a clear bug in the spec
- Import all utilities from `@ai-devs/core` — do NOT create local config.ts, logger.ts, or tool-factory.ts
- Every tool gets its own file in `tools/` directory
- Validate tool args with Zod schemas
- Config via `createConfig()` from core — never inline `process.env`
- Log agent decisions, tool calls, and API interactions via `logger` from core
- Handle errors gracefully — tools return error JSON, never throw to agent loop
- Use `runAgent()` for standard agent loops — only build custom loops for non-standard flows
