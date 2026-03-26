---
name: create-spec
description: "Create spec.md from task.md and lesson.md. Use when starting a new task, generating implementation specs, or planning a solution approach."
argument-hint: "Provide task folder name (e.g. s03e04)"
---
# Create Specification

## When to Use
- Starting a new task day
- User has placed `task.md` and/or `lesson.md` in the task folder

## Procedure
1. Read `task.md` in the target folder — this is the primary requirement
2. Read `lesson.md` if present — use as reference/inspiration, not as constraint
3. Review relevant prior solutions for applicable patterns (search `s*/src/agent.ts`, `s*/spec.md`)
4. Ask follow-up questions to clarify requirements and drive key decisions
5. Generate `spec.md` using the [template](./references/spec-template.md)
6. Review: ensure spec is not bloated, is easy to follow, but detailed enough to guide agentic implementation

## Key Principles
- spec.md is the **single source of truth** for implementation
- Include concrete tool schemas (JSON), not vague descriptions
- Include the system prompt template — the agent persona matters
- Call out known gotchas from lesson.md or prior solutions
- Prefer simple architecture unless complexity is justified
- Spec the execution flow as a clear sequence, not prose
