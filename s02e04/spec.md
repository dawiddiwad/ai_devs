# AI Agent for Mailbox Search

## 1. Overview & Goal

### Task Summary

The agent must autonomously search an email inbox via the zmail API, extract three specific pieces of information from different emails, and submit them to the hub endpoint to capture a flag. The mailbox is live — new messages may arrive during execution, so the agent must account for that.

The three target values are:

| Field | Format | Description |
|---|---|---|
| `date` | `YYYY-MM-DD` | Date when the security department plans an attack on our power plant |
| `password` | free-text | Password to the employee system, found somewhere in the mailbox |
| `confirmation_code` | `SEC-` + 32 chars (36 total) | Confirmation code from a ticket sent by the security department |

### Hardcoded Inputs / Initial Data

| Field | Value |
|---|---|
| Hub base URL | `https://***hub_endpoint***` |
| Zmail endpoint | `POST https://***hub_endpoint***/api/zmail` |
| Verify endpoint | `POST https://***hub_endpoint***/api/verify` |
| Task name | `mailbox` |
| Known sender | Wiktor, sends from `proton.me` domain |
| API key | from `AI_DEVS_API_KEY` env variable |

### Final Deliverable

A POST request to `/api/verify` with the three extracted values. The hub returns a flag in format `{FLG:...}` when all values are correct. The flag must be captured programmatically (regex extraction, not LLM), logged, and the process must exit with code `0`.

---

## 2. Agent Persona & Prompt Strategy

### Architecture: Orchestrator + 3 Specialized Finders

The system uses an **orchestrator pattern** with one coordinator agent and three specialized sub-agents. Each sub-agent is delegated via a one-shot call and returns its findings. The coordinator maintains all state.

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

Each sub-agent has access to `searchMail` and `readMail` tools. The coordinator has `delegate`, `submitAnswer`, and `finish` tools.

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
- The zmail API supports Gmail-like search operators: from:, to:, subject:, OR, AND

## Your workflow
1. Use the `delegate` tool to send each finder agent to search for its assigned value
2. Collect the results. If a finder reports it could not find its value, wait briefly and retry by delegating again — the email may not have arrived yet
3. Once all three values are collected, use `submitAnswer` to send them to the hub
4. If the hub reports errors (wrong values), re-delegate the relevant finder(s) with the feedback
5. When the hub returns a flag, use `finish` to complete the task

## Rules
- Delegate to finders one at a time (sequential) to avoid API rate limits
- Never guess or fabricate values — only use information extracted from actual emails
- If a value is not found after a delegation, retry up to 5 times with a note to the finder that the email may have just arrived
- Always pass hub feedback to finders when re-delegating
```

### System Prompt — Date Finder Agent

```markdown
You are a specialized email search agent. Your task is to find the **date** when the security department plans an attack on a power plant.

## Search strategy
1. Start by searching for emails related to the security department, attacks, or power plant
2. Try queries like: subject with security-related keywords, from known security contacts
3. Remember that Wiktor (from proton.me) sent a tip-off — his email may reference the attack
4. Read the full content of any promising emails
5. Extract the date in YYYY-MM-DD format

## Rules
- Use `searchMail` to find emails, then `readMail` to get full content
- Search broadly first, then narrow down
- Return ONLY the extracted date in YYYY-MM-DD format, or report that you could not find it
- Never guess — only return a date explicitly stated in an email
```

### System Prompt — Password Finder Agent

```markdown
You are a specialized email search agent. Your task is to find the **password to the employee system** that is stored somewhere in the mailbox.

## Search strategy
1. Search for emails containing password-related keywords — password, hasło, credentials, login, access
2. Check emails about system access, onboarding, or account setup
3. Read the full content of any promising emails
4. Extract the exact password string

## Rules
- Use `searchMail` to find emails, then `readMail` to get full content
- Search broadly first, then narrow down
- Return ONLY the extracted password string, or report that you could not find it
- Never guess — only return a password explicitly stated in an email
```

### System Prompt — Confirmation Code Finder Agent

```markdown
You are a specialized email search agent. Your task is to find a **confirmation code** from a ticket sent by the security department.

## Search strategy
1. Search for emails containing ticket or confirmation-related keywords — SEC-, confirmation, ticket, kod, potwierdzenie
2. Look for emails from the security department
3. Read the full content of any promising emails
4. The code format is: SEC- followed by 32 characters (36 characters total)

## Rules
- Use `searchMail` to find emails, then `readMail` to get full content
- Search broadly first, then narrow down
- Return ONLY the extracted confirmation code (SEC-XXXXXXXX...), or report that you could not find it
- Never guess — only return a code explicitly stated in an email
- Validate format: must start with SEC- and be 36 characters total
```

---

## 3. Tool Definitions (Function Calls)

### 3.1 `searchMail`

**Description:** Search the mailbox using Gmail-like query operators. Returns a paginated list of email metadata (no body content).

**Input Schema:**
```json
{
  "type": "object",
  "properties": {
    "query": {
      "type": "string",
      "description": "Search query using Gmail-like operators (from:, to:, subject:, OR, AND). Example: 'from:proton.me subject:security'"
    },
    "page": {
      "type": "number",
      "description": "Page number for pagination (starts at 1)"
    }
  },
  "required": ["query"]
}
```

**Behavior:**
- Calls `POST https://***hub_endpoint***/api/zmail` with `{ apikey, action: "search", query, page }`
- Falls back to `action: "getInbox"` with `page` if no query provided
- Logs request/response via `logger.api`

**Return value:**
```json
{
  "emails": [
    { "id": "string", "from": "string", "to": "string", "subject": "string", "date": "string" }
  ],
  "totalPages": 1
}
```

### 3.2 `readMail`

**Description:** Fetch the full content of a specific email by its ID.

**Input Schema:**
```json
{
  "type": "object",
  "properties": {
    "id": {
      "type": "string",
      "description": "The email ID to retrieve"
    }
  },
  "required": ["id"]
}
```

**Behavior:**
- Calls `POST https://***hub_endpoint***/api/zmail` with `{ apikey, action: "getMessage", id }`
- Logs request/response via `logger.api`

**Return value:**
```json
{
  "id": "string",
  "from": "string",
  "to": "string",
  "subject": "string",
  "date": "string",
  "body": "string"
}
```

### 3.3 `delegate`

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
- Instantiates the selected sub-agent with its system prompt and tools (`searchMail`, `readMail`)
- Passes the `context` string as the user message
- Runs the sub-agent's tool-calling loop to completion
- Returns the sub-agent's final text response
- Logs delegation and result via `logger.agent`

**Return value:**
```json
{
  "result": "string — the sub-agent's extracted value or a 'not found' report"
}
```

### 3.4 `submitAnswer`

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
- Calls `POST https://***hub_endpoint***/api/verify` with `{ apikey, task: "mailbox", answer: { password, date, confirmation_code } }`
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

### 3.5 `finish`

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
  ├─ 2. Call zmail API `help` action to discover available actions/params
  │
  ├─ 3. Delegate to Date Finder
  │     └─ Finder searches mailbox → returns date or "not found"
  │
  ├─ 4. Delegate to Password Finder
  │     └─ Finder searches mailbox → returns password or "not found"
  │
  ├─ 5. Delegate to Confirmation Code Finder
  │     └─ Finder searches mailbox → returns code or "not found"
  │
  ├─ 6. If any value is missing → retry that delegation (up to 5 times)
  │     └─ Brief pause between retries (new emails may arrive)
  │
  ├─ 7. Once all 3 values collected → submitAnswer to hub
  │     ├─ If flag returned → finish(flag)
  │     └─ If error feedback → re-delegate relevant finder(s) with feedback
  │
  └─ END (process.exit(0) after flag capture)
```

### Key Decision Points

1. **Value not found**: The coordinator retries the specific finder up to 5 times. Each retry includes a note that previous search failed and new emails may have arrived. The LLM coordinator decides the timing and strategy.
2. **Hub reports wrong value**: The coordinator re-delegates the specific finder with the hub's feedback message as additional context.
3. **All retries exhausted**: If after 5 retries a value is still not found, the coordinator logs an error and exits with code `1`.
4. **API help response**: The coordinator first calls `help` to discover any additional actions or parameters not documented in the task. This ensures the agent adapts to the actual API.

---

## 5. Dependencies & Environment

### package.json additions

No additional packages needed. The existing dependencies are sufficient:

| Package | Purpose |
|---|---|
| `openai` | OpenAI API client for chat completions with function calling |
| `zod` | Schema validation for tool inputs/outputs |
| `axios` | HTTP client for zmail and hub API calls |
| `dotenv` | Environment variable management |

### Environment Variables (`.env`)

```env
OPENAI_API_KEY=your-openai-api-key-here
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
    mailbox.ts          # searchMail, readMail implementations (zmail API)
    hub.ts              # submitAnswer implementation (verify API)
    delegate.ts         # delegate tool — runs a sub-agent via runner
    finish.ts           # finish tool — logs flag, exits process
  config.ts             # Constants (URLs, task name) and env access
  logger.ts             # Existing structured logger (agent/tool/api categories)
```

---

## 6. Key Implementation Notes

1. **Agent runner loop** (`agents/runner.ts`): A reusable function that takes a system prompt, tools, and a user message, then runs the OpenAI chat completion loop with `tool_choice: "auto"`. It iterates: call LLM → if tool calls, execute them and append results → repeat until LLM responds with a final text message (no tool calls). Max iterations should be capped (e.g., 20) to prevent runaway loops.

2. **Tool definitions** (`tools/definitions.ts`): Use `ChatCompletionTool` type from the `openai` package. Define zod schemas for each tool's parameters and use `zodResponseFormat` or manual `.parse()` for validation. Export both the OpenAI tool definitions array and a tool executor map (`Record<string, (args: unknown) => Promise<string>>`).

3. **Discover API before searching**: The coordinator's first action should be calling `help` on the zmail API. The response will reveal exact action names, parameters, and pagination details. This ensures the agent doesn't assume incorrect API behavior.

4. **Two-step email reading**: The zmail API returns metadata only from search/inbox queries. The agent must always call `readMail` to get the body before extracting information. Sub-agent prompts must emphasize this.

5. **Flag capture must be programmatic**: In `submitAnswer` (or in `index.ts` after the coordinator finishes), scan the hub response for the flag using regex `/\{FLG:[^}]+\}/`. Do NOT rely on the LLM to extract or relay the flag. Log it immediately via `logger.agent` and call `process.exit(0)`.

6. **Zod validation at boundaries**: Validate all external API responses (zmail, hub) with zod schemas. This catches unexpected response formats early and provides clear error messages.

7. **Sub-agent isolation**: Each sub-agent gets a fresh conversation (no shared message history). The coordinator passes context via the `delegate` tool's `context` parameter. This keeps sub-agent token usage low and focused.

8. **Logging discipline**: Every API call logs via `logger.api` (request params + response). Every tool execution logs via `logger.tool` (input + output). Every agent decision logs via `logger.agent` (which tool chosen, why, delegation results).

9. **Error handling**: Wrap all API calls in try/catch. On transient failures (network errors, 5xx), retry up to 3 times with exponential backoff. On 4xx errors, log and surface to the agent for decision-making.

10. **No semicolons**: Per AGENTS.md coding standards, do not use semicolons at the end of lines.

---

## 7. Acceptance Criteria

- [ ] Agent calls `help` on zmail API to discover available actions
- [ ] Coordinator successfully delegates to all 3 specialized finder agents
- [ ] Each finder uses `searchMail` + `readMail` to find its target value
- [ ] Coordinator collects all 3 values and submits via `submitAnswer`
- [ ] Hub returns flag `{FLG:...}` and it is captured via regex (not LLM)
- [ ] Flag is logged via `logger.agent('info', ...)` immediately upon capture
- [ ] Process exits with code `0` after flag capture
- [ ] Structured logs include agent/tool/api entries with timestamps
- [ ] All tool inputs validated with zod schemas
- [ ] All external API responses validated with zod schemas
- [ ] Code uses TypeScript, no semicolons, SOLID principles per AGENTS.md
- [ ] Retry logic handles live mailbox (missing emails may arrive later)
- [ ] Hub error feedback is used to re-delegate and correct wrong values
