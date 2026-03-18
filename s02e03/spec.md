# AI Agent for Failure Log Analysis

## 1. Overview & Goal

### Task Summary

The agent must fetch a large power plant log file, filter it down to failure-relevant events (power, cooling, water pumps, software, and other plant subsystems), compress them into ≤1500 tokens, and submit them to Centrala. The agent iterates on technician feedback until it receives a flag.

### Hardcoded Inputs / Initial Data

| Field           | Value                                                        |
| --------------- | ------------------------------------------------------------ |
| Log URL         | `https://***hub_endpoint***/data/${AI_DEVS_API_KEY}/failure.log` |
| Verify endpoint | `https://***hub_endpoint***/verify`                              |
| Task name       | `failure`                                                    |
| Token limit     | 1500                                                         |
| Max retries     | 5                                                            |

### Final Deliverable

A POST request to the verify endpoint with a JSON payload containing condensed logs. The agent loops until it receives a response containing the flag `{FLG:...}`.

---

## 2. Agent Persona & Prompt Strategy

### System Prompt (for the inner LLM agent)

```markdown
You are a power plant failure log analyst agent. Your job is to analyze a large log file from a power plant that experienced a failure yesterday, extract the most critical events, compress them into a concise summary, and submit them for technician review.

## Your workflow

1. First, fetch the log file using the fetch_logs tool
2. Search the logs for critical events (WARN, ERRO, CRIT levels) using search_logs tool
3. Analyze the filtered events and build a compressed log summary that fits within the token limit
4. Count tokens using count_tokens tool before submitting
5. Submit the compressed logs using submit_answer tool
6. If the response contains feedback (not a flag), refine your logs based on the feedback and resubmit

## Rules

- ALWAYS fetch logs first before any analysis
- Focus on events related to: power supply, cooling systems, water pumps, software failures, reactor components, emergency systems, and other plant subsystems
- Each output line must follow format: [YYYY-MM-DD HH:MM] [LEVEL] COMPONENT_ID description
- One event per line, lines separated by \n
- You may shorten and paraphrase descriptions but MUST preserve: timestamp, severity level, component identifier
- ALWAYS count tokens before submitting — never exceed 1500 tokens
- Use conservative token estimation (3.5 chars per token)
- When you receive feedback from technicians, carefully read which subsystems or events are missing and search the logs specifically for those
- After receiving feedback, use search_logs with targeted queries to find missing information
- NEVER guess or fabricate log entries — only use data from the actual log file
```

---

## 3. Tool Definitions (Function Calls)

### 3.1 `fetch_logs`

**Description:** Downloads the full log file from the remote URL and caches it locally in memory. Must be called once before any search operations.

**Input Schema:**

```json
{
	"type": "object",
	"properties": {},
	"required": []
}
```

**Behavior:**

- GET request to the log URL (constructed from env var `AI_DEVS_API_KEY`)
- Stores the full text in a module-level variable for subsequent searches
- Logs the total line count and approximate token count
- Returns a summary: total lines, total tokens, first/last timestamps

**Return value:**

```json
{
	"totalLines": 12345,
	"approximateTokens": 50000,
	"firstTimestamp": "2026-02-25 00:00",
	"lastTimestamp": "2026-02-26 23:59",
	"sample": "first 5 lines of the log"
}
```

### 3.2 `search_logs`

**Description:** Searches the cached log file using a regex pattern or keyword. Returns matching lines. Use this to find specific events, subsystems, or severity levels.

**Input Schema:**

```json
{
	"type": "object",
	"properties": {
		"query": {
			"type": "string",
			"description": "Regex pattern to search for in the log file. Examples: 'CRIT|ERRO|WARN', 'ECCS', 'pump|cooling', 'PWR\\d+'"
		},
		"maxResults": {
			"type": "number",
			"description": "Maximum number of matching lines to return. Default: 100"
		}
	},
	"required": ["query"]
}
```

**Behavior:**

- Applies the regex pattern (case-insensitive) against each line of the cached log
- Returns up to `maxResults` matching lines
- Logs the query and result count

**Return value:**

```json
{
	"matchCount": 42,
	"returnedCount": 42,
	"lines": "[2026-02-26 06:04] [CRIT] ECCS8 runaway outlet temp..."
}
```

### 3.3 `count_tokens`

**Description:** Estimates the token count of a given text string using a conservative heuristic (3.5 characters per token).

**Input Schema:**

```json
{
	"type": "object",
	"properties": {
		"text": {
			"type": "string",
			"description": "The text to count tokens for"
		}
	},
	"required": ["text"]
}
```

**Behavior:**

- Calculates `Math.ceil(text.length / 3.5)`
- Returns the count and whether it's within the 1500 token limit

**Return value:**

```json
{
	"tokenCount": 1234,
	"withinLimit": true,
	"limit": 1500
}
```

### 3.4 `submit_answer`

**Description:** Submits the compressed logs to Centrala for verification. Returns the technician feedback or the flag.

**Input Schema:**

```json
{
	"type": "object",
	"properties": {
		"logs": {
			"type": "string",
			"description": "The compressed log string with events separated by \\n"
		}
	},
	"required": ["logs"]
}
```

**Behavior:**

- POST to `https://***hub_endpoint***/verify` with body `{ apikey, task: "failure", answer: { logs } }`
- Parses the response for flag pattern `{FLG:...}`
- If flag found: logs it and signals process termination with exit code 0
- If no flag: returns the feedback text for the agent to iterate on

**Return value:**

```json
{
	"success": true,
	"flagFound": false,
	"response": "Technician feedback text..."
}
```

---

## 4. Execution Flow

```text
START
  │
  ├─ 1. Agent calls fetch_logs → gets log file metadata
  │
  ├─ 2. Agent calls search_logs (query: "WARN|ERRO|CRIT") → gets critical events
  │
  ├─ 3. Agent analyzes events, builds compressed log string
  │     (LLM reasoning: select most relevant, shorten descriptions)
  │
  ├─ 4. Agent calls count_tokens → verifies ≤1500
  │     If over limit → agent further compresses and recounts
  │
  ├─ 5. Agent calls submit_answer with compressed logs
  │
  ├─ 6. Check response:
  │     ├─ Flag found → log flag, exit(0) ✓
  │     └─ Feedback received → agent reads feedback
  │           ├─ Agent calls search_logs with targeted queries
  │           ├─ Agent refines compressed logs
  │           └─ Go to step 4 (max 5 retries)
  │
  └─ END (flag captured or max retries exhausted)
```

### Key Decision Points

- **Pre-filtering**: Regex filter for WARN/ERRO/CRIT lines reduces volume before LLM sees the data
- **Feedback loop**: Technician feedback specifies missing subsystems — agent must search logs for those specific components and incorporate them
- **Token budget**: Agent must always verify token count before submission; if over 1500, it must compress further
- **Flag detection**: Programmatic regex match on `\{FLG:[^}]+\}` — not LLM-based

---

## 5. Dependencies & Environment

### package.json additions

No new packages required beyond baseline. Using existing:

| Package  | Purpose                                                      |
| -------- | ------------------------------------------------------------ |
| `openai` | OpenAI API client for chat completions with function calling |
| `axios`  | HTTP requests (fetch logs, submit answer)                    |
| `dotenv` | Environment variable management                              |
| `zod`    | Input/output schema validation for tools                     |

### Environment Variables (`.env`)

```env
OPENAI_API_KEY=your-openai-api-key-here
OPENAI_MODEL=gpt-5-mini
AI_DEVS_API_KEY=your-ai-devs-api-key-here
AI_DEVS_TASK_NAME=failure
```

### Project Structure

```text
src/
  index.ts          # Entry point — bootstraps and runs the agent
  agent.ts          # Agent loop: chat completion + tool dispatch
  tools.ts          # Tool definitions (ChatCompletionTool[]) and handler implementations
  prompts.ts        # System prompt constant
  logger.ts         # Structured logging (agent/tool/api levels)
```

---

## 6. Key Implementation Notes

1. **Regex pre-filter before LLM**: First search for `WARN|ERRO|CRIT` to get the subset of important lines. This avoids sending the full log to the LLM and reduces cost.
2. **Conservative token heuristic**: Use 3.5 chars/token (slightly conservative) to avoid exceeding the 1500 token hard limit.
3. **Flag capture is programmatic**: Parse response text with regex `\{FLG:[^}]+\}`. Log the flag immediately and call `process.exit(0)`.
4. **Tool schemas use zod**: Define zod schemas for tool inputs, convert to JSON schema for `ChatCompletionTool` type definitions.
5. **Structured logging**: Three categories — `agent` (decisions, tool selection), `tool` (input/output of each tool call), `api` (HTTP requests/responses to OpenAI and Centrala).
6. **Log file cached in memory**: Download once, store as string array. All `search_logs` calls operate on the cached data.
7. **No semicolons**: Per coding standards.
8. **Feedback-driven refinement**: When technicians say a subsystem is missing, the agent should search logs for that subsystem ID and add relevant events to the compressed output.

---

## 7. Acceptance Criteria

- [ ] Agent fetches the full log file from the remote URL
- [ ] Regex pre-filter extracts WARN/ERRO/CRIT events
- [ ] LLM compresses filtered events to ≤1500 tokens
- [ ] Token count is verified before each submission
- [ ] Agent submits compressed logs to Centrala verify endpoint
- [ ] Agent reads feedback and refines logs (up to 5 retries)
- [ ] Flag is captured programmatically via regex and logged
- [ ] Process exits with code 0 after flag capture
- [ ] Structured logging with agent/tool/api categories
- [ ] All code in TypeScript, no semicolons, SOLID principles
- [ ] Environment variables managed via dotenv
