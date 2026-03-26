---
description: "Use when implementing flag capture, task verification, /verify endpoint, task submission to the hub, or handling verify responses."
---
# Flag Capture & Task Submission

## Rules
1. Capture flag programmatically via regex — **never** through LLM
2. Single capture point only — in the verify/submit tool
3. Log immediately on capture
4. `process.exit(0)` after capture

## Implementation
```ts
const FLAG_REGEX = /\{FLG:.*?\}/

const response = await axios.post(config.verifyEndpoint, payload, {
  validateStatus: () => true,  // Never throw — error responses contain feedback
})

const responseText = typeof response.data === 'string'
  ? response.data : JSON.stringify(response.data)

const flagMatch = responseText.match(FLAG_REGEX)
if (flagMatch) {
  logger.agent('info', `FLAG CAPTURED: ${flagMatch[0]}`)
  process.exit(0)
}

// Always return response text — failed verifications contain hints
return responseText
```

## Verify Payload Format
```ts
{
  task: config.taskName,
  apikey: config.aiDevsApiKey,
  answer: result,  // Task-specific answer
}
```
