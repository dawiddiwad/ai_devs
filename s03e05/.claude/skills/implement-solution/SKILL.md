---
name: implement-solution
description: "Implement solution from spec.md. Use when coding a task solution, building an agent, creating tools, or implementing a spec."
argument-hint: "Provide task folder name (e.g. s03e04)"
---
# Implement Solution from Spec

## When to Use
- spec.md exists and is ready for implementation
- User asks to implement/code/build a solution

## Personality
- Write code like Linus Torvalds 

## Procedure
1. Read `spec.md` — this is the authoritative source. Follow it strictly.
2. Read `template/` files for scaffold reference: [config.ts](../../template/src/config.ts), [logger.ts](../../template/src/logger.ts), [package.json](../../template/package.json)
3. Review the [architecture patterns](./references/architecture.md) for established conventions
4. Scaffold project structure if starting fresh (copy from template)
5. Implement in order: config → types → tools → agent → index
6. Run `npm run build` to verify — fix all errors before declaring done

## Rules
- Follow spec.md to the letter — deviate only if there's a clear bug in the spec
- Use patterns from prior solutions — see references for code patterns
- Every tool gets its own file in `tools/` directory
- Validate tool args with Zod schemas
- Config via `config.ts` — never inline `process.env`
- Log agent decisions, tool calls, and API interactions
- Handle errors gracefully — tools return error JSON, never throw to agent loop
