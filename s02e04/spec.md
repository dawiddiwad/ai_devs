# AI Agent for Mailbox Search

## 1. Overview & Goal

### Task Summary

The agent must autonomously search an email inbox via the zmail API, extract three specific pieces of information from different emails, and submit them to the hub endpoint to capture a flag. The mailbox is live — new messages may arrive during execution, so the agent must account for that.

The three target values are:

| Field               | Format                       | Description                                                          |
| ------------------- | ---------------------------- | -------------------------------------------------------------------- |
| `date`              | `YYYY-MM-DD`                 | Date when the security department plans an attack on our power plant |
| `password`          | free-text                    | Password to the employee system, found somewhere in the mailbox      |
| `confirmation_code` | `SEC-` + 32 chars (36 total) | Confirmation code from a ticket sent by the security department      |

### Hardcoded Inputs / Initial Data

| Field           | Value                                       |
| --------------- | ------------------------------------------- |
| Hub base URL    | `https://***hub_endpoint***`                |
| Zmail endpoint  | `POST https://***hub_endpoint***/api/zmail` |
| Verify endpoint | `POST https://***hub_endpoint***/verify`    |
| Task name       | `mailbox`                                   |
| Known sender    | Wiktor, sends from `proton.me` domain       |
| API key         | from `AI_DEVS_API_KEY` env variable         |

### Final Deliverable

A POST request to `/api/verify` with the three extracted values. The hub returns a flag in format `{FLG:...}` when all values are correct. The flag must be captured programmatically (regex extraction, not LLM), logged, and the process must exit with code `0`.

---

## 2. Agent Persona & Prompt Strategy

### Architecture: Orchestrator + Generic Finder

The system uses an **orchestrator pattern** with one coordinator agent and a single reusable finder agent. The coordinator spawns finder instances with precise instructions describing what to search for. Each finder is **fully autonomous** — it discovers the mailbox API via `email_request` with action `help`, searches for its target value, and handles retries with 30-second waits (up to 10 times) before returning.

```
┌──────────────────────────────────────────────────────┐
│                  Coordinator Agent                    │
│  - Spawns finders with precise instructions          │
│  - Collects results into answer object               │
│  - Submits to hub, handles retries                   │
│  - Captures flag and terminates                      │
└────┬──────────────┬──────────────┬───────────────────┘
     │              │              │
     ▼              ▼              ▼
┌─────────┐  ┌───────────┐  ┌──────────────────┐
│  Finder │  │  Finder   │  │     Finder       │
│ (date)  │  │ (password)│  │  (conf. code)    │
└─────────┘  └───────────┘  └──────────────────┘
     (same generic agent, different instructions)
```

Each finder has access to `email_request` (generic zmail API passthrough) and `wait` tools. The coordinator has `delegate`, `submitAnswer`, and `finish` tools.

### System Prompt — Coordinator Agent

```markdown
You are a coordinator agent managing a mailbox investigation. Your goal is to find three pieces of information by spawning finder agents and then submitting the answer to the hub.

## Target values
1. **date** — when the security department plans an attack on our power plant (format: YYYY-MM-DD)
2. **password** — password to the employee system
3. **confirmation_code** — code from a security department ticket (format: SEC- followed by 32 characters, 36 total)

## Known context
- A person named Wiktor sent a tip-off email from a proton.me domain
- The mailbox is live — new emails may arrive at any time

## Your workflow
1. Use the delegate tool to spawn a finder for each value. Write a brief but precise instruction telling the finder exactly what to search for, which keywords and strategies to use, and what format the result should be in. Each finder is autonomous — it discovers the mailbox API itself and handles retries.
2. Collect the results. If a finder reports it could not find its value, spawn another finder with adjusted instructions.
3. Once all three values are collected, use submitAnswer to send them to the hub.
4. If the hub reports errors (wrong values), spawn new finders with the feedback.
5. When the hub returns a flag (look for "success": true and "flag" in the response), use finish to complete the task.

## Instruction guidelines for finders
- Tell them what value to find and its exact format
- Suggest search keywords, sender names, or subject patterns
- Mention that search/getInbox return metadata only — they must use getMessages to read bodies
- Keep instructions concise (3-6 sentences)

## Rules
- If finder encounter rate limits, next time spawn finders one at a time (sequential) to avoid API rate limits
- Never guess or fabricate values — only use information provided by the finders
- Always pass hub feedback to appropriate finders when re-delegating
```

### System Prompt — Generic Finder Agent

```markdown
You are an autonomous email search agent. You have access to a mailbox via the tool.

## Your workflow
1. Learn about email API.
2. Follow the instruction given to you in the user message — it tells you exactly what to search for
3. Use search/getInbox to find relevant emails (these return metadata only, no body)
4. Use getMessages with IDs from results to read full message bodies
5. Extract the requested value from the email content

## Rules
- If you cannot find the information, wait for 30s as new emails may arrive.
- If you encounter rate limiting errors, wait for 30, 60 or 120 seconds, then retry with a different strategy
- Retry up to 10 times before giving up
- Return ONLY the extracted value, or report that you could not find it
- Never guess — only return values explicitly stated in emails
```

---

## 3. Tool Definitions (Function Calls)

### Finder Agent Tools

These tools are available to all finder agent instances. The `email_request` tool is a generic passthrough to the zmail API — the agent discovers available actions at runtime via `help`.

#### 3.1 `email_request`

**Description:** Send a request to the zmail API. Pass any action and its parameters. Call with action "help" first to discover available actions.

**Input Schema:**

```json
{
	"type": "object",
	"properties": {
		"action": {
			"type": "string",
			"description": "The zmail API action (e.g. help, getInbox, getThread, getMessages, search)"
		}
	},
	"required": ["action"],
	"additionalProperties": true
}
```

**Behavior:**

- Calls `POST https://***hub_endpoint***/api/zmail` with `{ apikey, action, ...params }`
- Returns the raw JSON response from the API
- Logs request/response via `logger.api`

**Return value:** Raw JSON response from the API.

#### 3.2 `wait`

**Description:** Wait for a specified number of seconds. Used before retrying when emails are not found yet.

**Input Schema:**

```json
{
	"type": "object",
	"properties": {
		"seconds": {
			"type": "number",
			"description": "Seconds to wait. Default: 30"
		}
	}
}
```

**Behavior:**

- Pauses execution for the specified number of seconds (default 30)
- Returns `{ "waited": <seconds> }`
- Logs via `logger.tool`

### Coordinator Agent Tools

#### 3.7 `delegate`

**Description:** Spawn a generic finder agent with a specific instruction. The finder has access to the mailbox API (`email_request` + `wait`) and will follow the instruction autonomously.

**Input Schema:**

```json
{
	"type": "object",
	"properties": {
		"instruction": {
			"type": "string",
			"description": "Precise instruction for the finder agent: what to search for, what keywords/strategies to use, expected format of the result."
		}
	},
	"required": ["instruction"]
}
```

**Behavior:**

- Instantiates a generic finder agent with its system prompt and tools (`email_request`, `wait`)
- Passes the `instruction` string as the user message
- Runs the finder's tool-calling loop to completion (max 40 iterations)
- Returns the finder's final text response
- Logs delegation and result via `logger.agent`

**Return value:**

```json
{
	"result": "string — the finder's extracted value or a 'not found' report"
}
```

#### 3.8 `submitAnswer`

**Description:** Submit the collected answer to the hub's verify endpoint.

**Input Schema:**

```json
{
	"type": "object",
	"properties": {
		"password": {
			"type": "string",
			"description": "The employee system password"
		},
		"date": {
			"type": "string",
			"description": "The attack date in YYYY-MM-DD format"
		},
		"confirmation_code": {
			"type": "string",
			"description": "The SEC- confirmation code (36 chars)"
		}
	},
	"required": ["password", "date", "confirmation_code"]
}
```

**Behavior:**

- Calls `POST https://***hub_endpoint***/verify` with `{ apikey, task: "mailbox", answer: { password, date, confirmation_code } }`
- Checks response for flag pattern `{FLG:...}`
- If flag found: extracts it programmatically via regex `/\{FLG:[^}]+\}/`, logs it, and signals completion
- If no flag: returns hub feedback for the coordinator to act on
- Logs request/response via `logger.api`

**Return value:**

```json
{
	"success": true,
	"flag": "{FLG:...}",
	"rawResponse": "..."
}
```

#### 3.9 `finish`

**Description:** Terminate the agent loop successfully after the flag has been captured.

**Input Schema:**

```json
{
	"type": "object",
	"properties": {
		"flag": {
			"type": "string",
			"description": "The captured flag string"
		}
	},
	"required": ["flag"]
}
```

**Behavior:**

- Logs the flag via `logger.agent('info', 'Flag captured', { flag })`
- Terminates the process with `process.exit(0)`

**Return value:** Does not return — process exits.

---

## 4. Execution Flow

```text
START
  │
  ├─ 1. Coordinator receives task description
  │
  ├─ 2. Spawn finder with instruction: "Find the attack date..."
  │     └─ Finder calls email_request(help) → discovers API → searches → returns date
  │        └─ If not found: waits 30s, retries (up to 10 times autonomously)
  │
  ├─ 3. Spawn finder with instruction: "Find the employee password..."
  │     └─ Finder calls email_request(help) → discovers API → searches → returns password
  │        └─ If not found: waits 30s, retries (up to 10 times autonomously)
  │
  ├─ 4. Spawn finder with instruction: "Find the SEC- confirmation code..."
  │     └─ Finder calls email_request(help) → discovers API → searches → returns code
  │        └─ If not found: waits 30s, retries (up to 10 times autonomously)
  │
  ├─ 5. Once all 3 values collected → submitAnswer to hub
  │     ├─ If flag returned → finish(flag)
  │     └─ If error feedback → spawn new finder(s) with feedback
  │
  └─ END (process.exit(0) after flag capture)
```

### Key Decision Points

1. **Value not found**: Each sub-agent autonomously retries up to 10 times, calling `wait` for 30 seconds between attempts. New emails may arrive during this time. The coordinator only re-delegates if the sub-agent exhausts retries or the hub reports a wrong value.
2. **Hub reports wrong value**: The coordinator re-delegates the specific finder with the hub's feedback message as additional context.
3. **API discovery**: Each sub-agent calls `help` as its FIRST action to discover available API actions and parameters. This ensures agents adapt to the actual API without hardcoded assumptions.
4. **Two-step reading**: The `search` and `getInbox` tools return metadata only. Agents must call `getMessages` with the IDs from search results to read full message bodies.

---

## 5. Dependencies & Environment

### package.json additions

No additional packages needed. The existing dependencies are sufficient:

| Package  | Purpose                                                      |
| -------- | ------------------------------------------------------------ |
| `openai` | OpenAI API client for chat completions with function calling |
| `zod`    | Schema validation for tool inputs/outputs                    |
| `axios`  | HTTP client for zmail and hub API calls                      |
| `dotenv` | Environment variable management                              |

### Environment Variables (`.env`)

```env
OPENAI_API_KEY=your-openai-api-key-here
OPENAI_BASE_URL=optional-custom-base-url
OPENAI_MODEL=gpt-4o-mini
AI_DEVS_API_KEY=your-ai-devs-api-key-here
```

### Project Structure

```text
src/
  index.ts              # Entry point — loads env, starts coordinator
  agents/
    runner.ts           # Reusable agent loop: system prompt + tools → iterate until done
    coordinator.ts      # Coordinator agent system prompt
    finder.ts           # Generic finder agent system prompt
  tools/
    definitions.ts      # ChatCompletionTool definitions with zod schemas
    mailbox.ts          # emailRequest (generic zmail passthrough), wait, helpMail
    hub.ts              # submitAnswer implementation (verify API)
    delegate.ts         # delegate tool — spawns a finder via runner
    finish.ts           # finish tool — logs flag, exits process
  config.ts             # Constants (URLs, task name) and env access
  logger.ts             # Existing structured logger (agent/tool/api categories)
```

---

## 6. Key Implementation Notes

1. **Agent runner loop** (`agents/runner.ts`): A reusable function that takes a system prompt, tools, tool executors, and a user message, then runs the OpenAI chat completion loop with `tool_choice: "auto"`. It iterates: call LLM → if tool calls, execute them and append results → repeat until LLM responds with a final text message (no tool calls). Max iterations capped at **40** to allow sub-agents enough room for retries with waits.

2. **OpenAI v6 type guard**: `ChatCompletionMessageToolCall` is a union type in OpenAI SDK v6. The runner must check `toolCall.type !== 'function'` before accessing `toolCall.function.name` and `toolCall.function.arguments`.

3. **Tool definitions** (`tools/definitions.ts`): Use `ChatCompletionTool` type from the `openai` package. Define zod schemas for each tool's parameters and use `.parse()` for validation. Export both the OpenAI tool definitions arrays (`finderTools`, `coordinatorTools`) and tool executor maps.

4. **Generic email_request tool**: Instead of hardcoding each zmail action as a separate tool, a single `email_request` tool passes the `action` and any additional parameters directly to the zmail API. The agent discovers available actions at runtime by calling `email_request({ action: "help" })`. The schema uses `.passthrough()` to allow arbitrary additional parameters.

5. **Unified finder agent**: A single generic finder system prompt (`agents/finder.ts`) instructs the agent to follow the user message (injected by the coordinator via delegate). The coordinator writes brief, precise instructions for each finder instance describing what to search for and how.

6. **Two-step email reading**: The `search` and `getInbox` actions return metadata only (no body). Agents must call `getMessages` with IDs from search/thread results to read full message content. The coordinator's instructions to finders should mention this.

7. **Flag capture must be programmatic**: In `submitAnswer`, scan the hub response for the flag using regex `/\{FLG:[^}]+\}/`. Do NOT rely on the LLM to extract or relay the flag. Log it immediately via `logger.agent` and call `finish` to terminate with `process.exit(0)`.

8. **Finder isolation**: Each finder gets a fresh conversation (no shared message history). The coordinator passes context via the `delegate` tool's `instruction` parameter. This keeps finder token usage low and focused.

9. **Autonomous retries in finders**: Each finder handles its own retry logic — up to 10 attempts with 30-second waits between them. This is more efficient than coordinator-driven retries because the finder maintains its search state across attempts.

10. **Error handling with retries**: All zmail API calls use a shared `zmailRequest` function with 3 retries and exponential backoff for transient failures (network errors, 5xx). On 4xx errors, the error is surfaced to the agent for decision-making.

11. **Logging discipline**: Every API call logs via `logger.api` (request params + response). Every tool execution logs via `logger.tool` (input + output). Every agent decision logs via `logger.agent` (which tool chosen, why, delegation results).

12. **No semicolons**: Per AGENTS.md coding standards, do not use semicolons at the end of lines.

---

## 7. Acceptance Criteria

- [ ] Each finder calls email_request with action "help" as its first action to discover available API actions
- [ ] Coordinator successfully spawns finder agents with precise instructions for all 3 values
- [ ] Each finder uses email_request to search and read emails to find its target value
- [ ] Finders autonomously retry up to 10 times with 30s waits when values are not found
- [ ] Coordinator collects all 3 values and submits via `submitAnswer`
- [ ] Hub returns flag `{FLG:...}` and it is captured via regex (not LLM)
- [ ] Flag is logged via `logger.agent('info', ...)` immediately upon capture
- [ ] Process exits with code `0` after flag capture
- [ ] Structured logs include agent/tool/api entries with timestamps
- [ ] All tool inputs validated with zod schemas
- [ ] Code uses TypeScript, no semicolons, SOLID principles per AGENTS.md
- [ ] Retry logic handles live mailbox (missing emails may arrive later)
- [ ] Hub error feedback is used to re-delegate and correct wrong values
- [ ] OpenAI v6 union type handled with proper type guard in runner
