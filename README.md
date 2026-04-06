# Agent V `monorepo`

Workspace for building AI agents that solve complex tasks using LLMs and tools. 

I've designed it as part of my journey to learn and experiment with OpenAI API during an online course. 

The goal was to build a modular structure that supports a wide variety of designs and use cases.

Each solution lives in its own `sXXeYY/` folder. New solutions are built on top of `@ai-devs/core` - my custom library that handles the openai API agent loop for both completions and responses, tool dispatch, flag capture, logging and observability. 

The `template/` folder is a basic scaffold for new agents.

## Launchpad

> Node.js 20+

> pnpm (`npm install -g pnpm`)

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

# Optional Langfuse tracing
LANGFUSE_PUBLIC_KEY=...
LANGFUSE_SECRET_KEY=...
LANGFUSE_BASE_URL=https://cloud.langfuse.com
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

#### Optional Observability

Example of how to set it up with pre-built adapter for [Langfuse](https://langfuse.com/):

```ts
import { createLangfuseObservability, runAgent } from '@ai-devs/core'

const observability = createLangfuseObservability({
	publicKey: config.langfusePublicKey,
	secretKey: config.langfuseSecretKey,
	baseUrl: config.langfuseBaseUrl,
	traceName: `task:${config.taskName}`,
	metadata: { task: config.taskName },
	sessionId: `${config.taskName}-${Date.now()}`,
})

await runAgent(config, {
	api: 'responses',
	tools: [your, tools, here],
	systemPrompt: SYSTEM_PROMPT,
	userPrompt: USER_PROMPT,
	observability,
})
```

Other observability can be implemented by custom adapters using `AgentObservability` interface and passing them to `runAgent`.

### 6. Run

```bash
# Development (ts-node, no build step)
npm run dev

# Production (full build + lint + run)
npm start
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
