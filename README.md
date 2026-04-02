# Agent Framework Monorepo

Monorepo for AI agents. Each agent lives in its own `sXXeYY/` folder. New tasks are built on top of `@ai-devs/core` — a shared library that handles the agent loop, tool dispatch, flag capture, and verification.

---

## Prerequisites

- Node.js 20+
- pnpm (`npm install -g pnpm`)

---

## Quick Start — New Task

### 1. Copy the template

```bash
cp -r template s05e01
cd s05e01
```

### 2. Update package.json

Change the `name` field:

```json
{ "name": "s05e01" }
```

### 3. Set up environment

```bash
cp .env.example .env
```

Edit `.env`:

```env
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-5.4-nano
AI_DEVS_API_KEY=...
AI_DEVS_TASK_NAME=your-task-name
AI_DEVS_HUB_ENDPOINT=https://...
```

### 4. Install dependencies

From the **repo root**:

```bash
pnpm install
```

### 5. Write your agent

You only need to touch three files:

| File | What to write |
|---|---|
| `src/prompts.ts` | System prompt + user prompt |
| `src/tools/*.ts` | Task-specific tools (one file per tool) |
| `src/tools/index.ts` | Register your tools in the array |

`src/index.ts` wires everything together and rarely needs changes.

### 6. Run

```bash
# Development (ts-node, no build step)
npm run dev

# Production (full build + lint + run)
npm start
```

---

## What's in `@ai-devs/core`

All infrastructure is imported from `@ai-devs/core`:

```ts
import {
  createConfig,     // Load env vars
  logger,           // Structured logging
  runAgent,         // Agent loop (responses or completions API)
  defineAgentTool,  // Tool factory with Zod validation
  verifyAnswer,     // POST to /verify + flag capture
  captureFlag,      // Regex flag extractor
  createOpenAIClient,
} from '@ai-devs/core'
```

---

## Common Patterns

### Standard agent (responses API)

`index.ts` uses this by default — nothing to change for most tasks:

```ts
await runAgent(config, {
  api: 'responses',
  tools,
  systemPrompt: SYSTEM_PROMPT,
  userPrompt: USER_PROMPT,
})
```

Switch to chat completions by changing `api: 'completions'`. Same tools, same interface.

### Adding a custom tool

Create `src/tools/my-tool.ts`:

```ts
import { z } from 'zod/v4'
import { defineAgentTool } from '@ai-devs/core'

export const myTool = defineAgentTool({
  name: 'fetch_data',
  description: 'Fetch data from the task API',
  schema: z.object({
    query: z.string().describe('Search query'),
  }),
  handler: async ({ query }) => {
    // Do work, return a string
    return JSON.stringify({ result: '...' })
  },
})
```

Register it in `src/tools/index.ts`:

```ts
import { verifyTool } from './verify.js'
import { myTool } from './my-tool.js'

export const tools = [verifyTool, myTool]
```

### Task-specific env vars

```ts
import { createConfig, requireEnv } from '@ai-devs/core'

const config = { ...createConfig(), serviceUrl: requireEnv('SERVICE_URL') }
```

Add `SERVICE_URL=` to `.env.example`.

### Reasoning / o-series models

```ts
await runAgent(config, {
  api: 'responses',
  model: 'gpt-5.4-nano',
  reasoning: { effort: 'low' },
  tools,
  systemPrompt: SYSTEM_PROMPT,
  userPrompt: USER_PROMPT,
})
```

### Multi-agent (sub-agents)

```ts
import { defineAgentTool, runAgent, createConfig } from '@ai-devs/core'

const config = createConfig()

const dispatchTool = defineAgentTool({
  name: 'run_subagent',
  description: 'Delegate a subtask to a specialized agent',
  schema: z.object({ task: z.string() }),
  handler: async ({ task }) => {
    const result = await runAgent(config, {
      api: 'responses',
      model: 'gpt-5.4-nano',
      tools: subTools,
      systemPrompt: SUBAGENT_PROMPT,
      userPrompt: task,
      exitOnFlag: false,   // sub-agent must not exit the process
    })
    return result.finalMessage
  },
})
```

### Escape hatch — fully custom loop

For tasks that need an HTTP server, batch processing, or other non-standard flows:

```ts
import { createConfig, logger, createOpenAIClient, captureFlag } from '@ai-devs/core'

const config = createConfig()
const client = createOpenAIClient(config)

// Wire your own Express server, batch loop, etc.
```

---

## Project Structure

```
ai_devs/
├── packages/
│   └── core/           # @ai-devs/core — shared library
│       └── src/
│           ├── config.ts
│           ├── logger.ts
│           ├── tool-factory.ts
│           ├── openai-client.ts
│           ├── run-agent.ts
│           ├── verify.ts
│           └── index.ts
│
├── template/           # Scaffold for new tasks
│   └── src/
│       ├── index.ts
│       ├── prompts.ts
│       └── tools/
│           ├── index.ts
│           └── verify.ts
│
├── s01e01/             # Existing lessons (independent, untouched)
├── ...
└── s04e03/
```

---

## Workspace Commands

Run from repo root:

```bash
pnpm install           # Install all dependencies
pnpm build:core        # Build @ai-devs/core
pnpm dev:core          # Watch-build @ai-devs/core
```

Run per-task:

```bash
cd sXXeYY
npm run dev            # Run with ts-node (fast iteration)
npm start              # Full build + run
npm run build          # Build only (tsc + lint + format)
```
