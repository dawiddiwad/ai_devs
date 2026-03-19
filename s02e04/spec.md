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

### Architecture: Orchestrator + 3 Autonomous Finders

The system uses an **orchestrator pattern** with one coordinator agent and three specialized sub-agents. Each sub-agent is **fully autonomous** — it discovers the mailbox API via the `help` tool, searches for its target value, and handles retries with 30-second waits (up to 10 times) before returning. The coordinator only delegates and collects results.

```
┌──────────────────────────────────────────────────────┐
│                  Coordinator Agent                    │
│  - Delegates to finders (sequentially)               │
│  - Collects results into answer object               │
│  - Submits to hub, handles retries                   │
│  - Captures flag and terminates                      │
└────┬──────────────┬──────────────┬───────────────────┘
     │              │              │
     ▼              ▼              ▼
┌─────────┐  ┌───────────┐  ┌──────────────────┐
│  Date   │  │ Password  │  │ Confirmation Code│
│ Finder  │  │  Finder   │  │     Finder       │
└─────────┘  └───────────┘  └──────────────────┘
```

Each sub-agent has access to `getInbox`, `getThread`, `getMessages`, `search`, `wait`, and `help` tools. The coordinator has `delegate`, `submitAnswer`, and `finish` tools.

### System Prompt — Coordinator Agent

```markdown
You are a coordinator agent managing a mailbox investigation. Your goal is to find three pieces of information by delegating search tasks to specialized sub-agents and then submitting the answer to the hub.

## Target values

1. **date** — when the security department plans an attack on our power plant (format: YYYY-MM-DD)
2. **password** — password to the employee system
3. **confirmation_code** — code from a security department ticket (format: SEC- followed by 32 characters, 36 total)

## Known context

- A person named Wiktor sent a tip-off email from a proton.me domain
- The mailbox is live — new emails may arrive at any time

## Your workflow

1. Use the delegate tool to send each finder agent to search for its assigned value. Each sub-agent is fully autonomous — it knows the mailbox API and will retry with 30-second waits up to 10 times if needed.
2. Collect the results. If a finder reports it could not find its value, you may re-delegate with additional context.
3. Once all three values are collected, use submitAnswer to send them to the hub.
4. If the hub reports errors (wrong values), re-delegate the relevant finder(s) with the feedback.
5. When the hub returns a flag (look for "success": true and "flag" in the response), use finish to complete the task.

## Rules

- Delegate to finders one at a time (sequential) to avoid API rate limits
- Never guess or fabricate values — only use information extracted from actual emails
- Always pass hub feedback to finders when re-delegating
```

### System Prompt — Date Finder Agent

```markdown
You are a specialized email search agent. Your task is to find the **date** when the security department plans an attack on a power plant.

## First step

Call the help tool to discover available mailbox API actions and their parameters.

## Search strategy

1. After calling help, use the discovered actions to browse and search the mailbox
2. Search for emails related to the security department, attacks, or power plant
3. Try queries like: subject with security-related keywords, from known security contacts
4. Remember that Wiktor (from proton.me) sent a tip-off — his email may reference the attack
5. Read the full content of promising emails (search/inbox only return metadata — use the appropriate action to fetch the body)
6. Extract the date in YYYY-MM-DD format

## Rules

- Always call help FIRST to learn what API actions and parameters are available
- If you cannot find the information, call wait (30 seconds) FIRST, then retry with a different search strategy
- Retry up to 10 times before giving up
- Return ONLY the extracted date in YYYY-MM-DD format, or report that you could not find it
- Never guess — only return a date explicitly stated in an email
```

### System Prompt — Password Finder Agent

```markdown
You are a specialized email search agent. Your task is to find the **password to the employee system** that is stored somewhere in the mailbox.

## First step

Call the help tool to discover available mailbox API actions and their parameters.

## Search strategy

1. After calling help, use the discovered actions to browse and search the mailbox
2. Search for emails containing password-related keywords — password, hasło, credentials, login, access
3. Check emails about system access, onboarding, or account setup
4. Read the full content of promising emails (search/inbox only return metadata — use the appropriate action to fetch the body)
5. Extract the exact password string

## Rules

- Always call help FIRST to learn what API actions and parameters are available
- If you cannot find the information, call wait (30 seconds) FIRST, then retry with a different search strategy
- Retry up to 10 times before giving up
- Return ONLY the extracted password string, or report that you could not find it
- Never guess — only return a password explicitly stated in an email
```

### System Prompt — Confirmation Code Finder Agent

```markdown
You are a specialized email search agent. Your task is to find a **confirmation code** from a ticket sent by the security department.

## First step

Call the help tool to discover available mailbox API actions and their parameters.

## Search strategy

1. After calling help, use the discovered actions to browse and search the mailbox
2. Search for emails containing ticket or confirmation-related keywords — SEC-, confirmation, ticket, kod, potwierdzenie
3. Look for emails from the security department
4. Read the full content of promising emails (search/inbox only return metadata — use the appropriate action to fetch the body)
5. The code format is: SEC- followed by 32 characters (36 characters total)

## Rules

- Always call help FIRST to learn what API actions and parameters are available
- If you cannot find the information, call wait (30 seconds) FIRST, then retry with a different search strategy
- Retry up to 10 times before giving up
- Return ONLY the extracted confirmation code (SEC-XXXXXXXX...), or report that you could not find it
- Never guess — only return a code explicitly stated in an email
- Validate format: must start with SEC- and be 36 characters total
```

---

## 3. Tool Definitions (Function Calls)

### Finder Agent Tools

These tools are available to all three specialized finder sub-agents. They map directly to the zmail API actions, which the agents discover at runtime via the `help` tool.

#### 3.1 `help`

**Description:** Discover available mailbox API actions and their parameters. Agents call this FIRST to learn what the API supports.

**Input Schema:**

```json
{
	"type": "object",
	"properties": {}
}
```

**Behavior:**

- Calls `POST https://***hub_endpoint***/api/zmail` with `{ apikey, action: "help" }`
- Returns the full API documentation including all available actions, their parameters, and descriptions
- Logs request/response via `logger.api`

**Return value:** Raw JSON response from the API describing all available actions.

#### 3.2 `getInbox`

**Description:** Return list of threads in the mailbox. No message body.

**Input Schema:**

```json
{
	"type": "object",
	"properties": {
		"page": {
			"type": "number",
			"description": "Page number, >= 1. Default: 1"
		},
		"perPage": {
			"type": "number",
			"description": "Items per page, 5-20. Default: 5"
		}
	}
}
```

**Behavior:**

- Calls `POST https://***hub_endpoint***/api/zmail` with `{ apikey, action: "getInbox", page, perPage }`
- Logs request/response via `logger.api`

#### 3.3 `getThread`

**Description:** Return rowID and messageID list for a selected thread. No message body.

**Input Schema:**

```json
{
	"type": "object",
	"properties": {
		"threadID": {
			"type": "number",
			"description": "Required. Numeric thread identifier."
		}
	},
	"required": ["threadID"]
}
```

**Behavior:**

- Calls `POST https://***hub_endpoint***/api/zmail` with `{ apikey, action: "getThread", threadID }`
- Logs request/response via `logger.api`

#### 3.4 `getMessages`

**Description:** Return one or more full messages (including body) by rowID or 32-char messageID.

**Input Schema:**

```json
{
	"type": "object",
	"properties": {
		"ids": {
			"description": "Numeric rowID, 32-char messageID, or an array of them.",
			"oneOf": [{ "type": "number" }, { "type": "string" }, { "type": "array" }]
		}
	},
	"required": ["ids"]
}
```

**Behavior:**

- Calls `POST https://***hub_endpoint***/api/zmail` with `{ apikey, action: "getMessages", ids }`
- This is the only way to read full message bodies
- Logs request/response via `logger.api`

#### 3.5 `search`

**Description:** Search messages with full-text style query and Gmail-like operators. Returns metadata only, not body.

**Input Schema:**

```json
{
	"type": "object",
	"properties": {
		"query": {
			"type": "string",
			"description": "Supports words, \"phrase\", -exclude, from:, to:, subject:, subject:\"phrase\", subject:(phrase), OR, AND. Missing operator means AND."
		},
		"page": {
			"type": "number",
			"description": "Page number, >= 1. Default: 1"
		},
		"perPage": {
			"type": "number",
			"description": "Items per page, 5-20. Default: 5"
		}
	},
	"required": ["query"]
}
```

**Behavior:**

- Calls `POST https://***hub_endpoint***/api/zmail` with `{ apikey, action: "search", query, page, perPage }`
- Returns metadata only — agents must use `getMessages` to read message bodies
- Logs request/response via `logger.api`

#### 3.6 `wait`

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

**Description:** Delegate a search task to a specialized sub-agent. Opens a new conversation with the sub-agent's system prompt and tools, runs it to completion, and returns the result.

**Input Schema:**

```json
{
	"type": "object",
	"properties": {
		"agentType": {
			"type": "string",
			"enum": ["dateFinder", "passwordFinder", "confirmationCodeFinder"],
			"description": "Which specialized agent to invoke"
		},
		"context": {
			"type": "string",
			"description": "Additional context or instructions for the sub-agent (e.g., hub feedback from a previous attempt)"
		}
	},
	"required": ["agentType"]
}
```

**Behavior:**

- Instantiates the selected sub-agent with its system prompt and tools (`getInbox`, `getThread`, `getMessages`, `search`, `wait`, `help`)
- Passes the `context` string as the user message
- Runs the sub-agent's tool-calling loop to completion (max 40 iterations)
- Returns the sub-agent's final text response
- Logs delegation and result via `logger.agent`

**Return value:**

```json
{
	"result": "string — the sub-agent's extracted value or a 'not found' report"
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
  ├─ 2. Delegate to Date Finder
  │     └─ Finder calls `help` → discovers API → searches mailbox → returns date
  │        └─ If not found: waits 30s, retries (up to 10 times autonomously)
  │
  ├─ 3. Delegate to Password Finder
  │     └─ Finder calls `help` → discovers API → searches mailbox → returns password
  │        └─ If not found: waits 30s, retries (up to 10 times autonomously)
  │
  ├─ 4. Delegate to Confirmation Code Finder
  │     └─ Finder calls `help` → discovers API → searches mailbox → returns code
  │        └─ If not found: waits 30s, retries (up to 10 times autonomously)
  │
  ├─ 5. Once all 3 values collected → submitAnswer to hub
  │     ├─ If flag returned → finish(flag)
  │     └─ If error feedback → re-delegate relevant finder(s) with feedback
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
    coordinator.ts      # Coordinator agent config (system prompt, tools, task message)
    dateFinder.ts       # Date finder agent config
    passwordFinder.ts   # Password finder agent config
    codeFinder.ts       # Confirmation code finder agent config
  tools/
    definitions.ts      # ChatCompletionTool definitions with zod schemas
    mailbox.ts          # getInbox, getThread, getMessages, search, wait, helpMail (zmail API)
    hub.ts              # submitAnswer implementation (verify API)
    delegate.ts         # delegate tool — runs a sub-agent via runner
    finish.ts           # finish tool — logs flag, exits process
  config.ts             # Constants (URLs, task name) and env access
  logger.ts             # Existing structured logger (agent/tool/api categories)
```

---

## 6. Key Implementation Notes

1. **Agent runner loop** (`agents/runner.ts`): A reusable function that takes a system prompt, tools, tool executors, and a user message, then runs the OpenAI chat completion loop with `tool_choice: "auto"`. It iterates: call LLM → if tool calls, execute them and append results → repeat until LLM responds with a final text message (no tool calls). Max iterations capped at **40** to allow sub-agents enough room for retries with waits.

2. **OpenAI v6 type guard**: `ChatCompletionMessageToolCall` is a union type in OpenAI SDK v6. The runner must check `toolCall.type !== 'function'` before accessing `toolCall.function.name` and `toolCall.function.arguments`.

3. **Tool definitions** (`tools/definitions.ts`): Use `ChatCompletionTool` type from the `openai` package. Define zod schemas for each tool's parameters and use `.parse()` for validation. Export both the OpenAI tool definitions arrays (`finderTools`, `coordinatorTools`) and tool executor maps.

4. **API discovery per sub-agent**: Each sub-agent calls `help` as its FIRST action. The help response reveals exact action names, parameters, query syntax, and pagination details. This replaced an earlier approach of hardcoding API reference in prompts — dynamic discovery is more robust.

5. **Two-step email reading**: The `search` and `getInbox` actions return metadata only (no body). Agents must call `getMessages` with IDs from search/thread results to read full message content. Sub-agent prompts emphasize this workflow.

6. **Flag capture must be programmatic**: In `submitAnswer`, scan the hub response for the flag using regex `/\{FLG:[^}]+\}/`. Do NOT rely on the LLM to extract or relay the flag. Log it immediately via `logger.agent` and call `finish` to terminate with `process.exit(0)`.

7. **Sub-agent isolation**: Each sub-agent gets a fresh conversation (no shared message history). The coordinator passes context via the `delegate` tool's `context` parameter. This keeps sub-agent token usage low and focused.

8. **Autonomous retries in sub-agents**: Each finder agent handles its own retry logic — up to 10 attempts with 30-second waits between them. This is more efficient than coordinator-driven retries because the sub-agent maintains its search state across attempts.

9. **Error handling with retries**: All zmail API calls use a shared `zmailRequest` function with 3 retries and exponential backoff for transient failures (network errors, 5xx). On 4xx errors, the error is surfaced to the agent for decision-making.

10. **Logging discipline**: Every API call logs via `logger.api` (request params + response). Every tool execution logs via `logger.tool` (input + output). Every agent decision logs via `logger.agent` (which tool chosen, why, delegation results).

11. **No semicolons**: Per AGENTS.md coding standards, do not use semicolons at the end of lines.

---

## 7. Acceptance Criteria

- [ ] Each sub-agent calls `help` on zmail API as its first action to discover available actions
- [ ] Coordinator successfully delegates to all 3 specialized finder agents
- [ ] Each finder uses `search`/`getInbox` + `getMessages` to find its target value
- [ ] Sub-agents autonomously retry up to 10 times with 30s waits when values are not found
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
