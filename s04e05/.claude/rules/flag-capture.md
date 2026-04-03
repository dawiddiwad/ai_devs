---
description: 'Use when implementing flag capture, task verification, /verify endpoint, task submission to the hub, or handling verify responses.'
---

# Flag Capture & Task Submission

## Rules

1. Capture flag programmatically via regex — **never** through LLM
2. Single capture point only — in the verify/submit tool
3. Log immediately on capture
4. `process.exit(0)` after capture

## Implementation

Use `verifyAnswer()` from `@ai-devs/core` — it handles POST, flag regex, logging, and `process.exit(0)` automatically.

```ts
import { createConfig, verifyAnswer } from '@ai-devs/core'

const config = createConfig()
const result = await verifyAnswer(config, answer)
// If flag is found, process.exit(0) is called automatically
// To suppress exit: verifyAnswer(config, answer, { exitOnFlag: false })
```

## Standard Verify Tool

Use the template's `tools/verify.ts` as starting point:

```ts
import { z } from 'zod/v4'
import { defineAgentTool, createConfig, verifyAnswer } from '@ai-devs/core'

const config = createConfig()

export const verifyTool = defineAgentTool({
	name: 'verify_answer',
	description: 'Submit an answer for verification',
	schema: z.object({
		answer: z.unknown().describe('The answer to submit'),
	}),
	handler: async ({ answer }) => {
		const result = await verifyAnswer(config, answer)
		return result.responseText
	},
})
```

## Verify Payload Format (handled by core)

```ts
{
  task: config.taskName,
  apikey: config.aiDevsApiKey,
  answer: result,
}
```
