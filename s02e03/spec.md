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

## 2. Dual-Model Architecture

### Design Principle

The system uses two models to optimize token consumption and accuracy:

1. **Orchestrator (big model)** — Runs the agent loop, decides which tools to call, reads hub feedback. **Never sees raw log content.** Only receives metadata (line counts, token counts, match counts) and API responses.
2. **Compressor (small model)** — Handles log compression into ≤1500 tokens. Receives raw log lines and compression instructions. Output is cached internally and auto-attached to submissions.

### Orchestrator System Prompt

````markdown
You are a power plant failure log analyst agent. Your job is to analyze a large log file from a power plant that experienced a failure yesterday, extract the most critical events, compress them into a concise summary, and submit them for technician review.

## Your workflow

1. First, fetch the log file using the fetch_logs tool
2. Search the logs for critical events (WARN, ERRO, CRIT levels) using search_logs tool
3. Analyze the filtered events and build a compressed log summary that fits within the token limit
4. Count tokens using count_tokens tool before submitting
5. Submit the compressed logs using submit_answer tool
6. If the response contains feedback (not a flag), refine your logs based on the feedback and resubmit

## Rules

The orchestrator never sees raw log content. It receives only metadata and API responses. See `src/prompts.ts` for the full prompt.

### Compressor System Prompt

The compressor receives raw log lines and instructions, and outputs compressed log entries in the required format. See `src/prompts.ts` for the full prompt.

---

## 3. Tool Definitions (Function Calls)

### 3.1 `fetch_logs`

**Description:** Downloads the full log file from the remote URL and caches it locally in memory. Resets search buffer and cached compression.

**Input Schema:** `{}` (no parameters)

**Returns to orchestrator:** Metadata only — `{ totalLines, approximateTokens, firstTimestamp, lastTimestamp }`. No raw log content.

### 3.2 `search_logs`

**Description:** Searches the cached log file using a regex pattern. Matching lines are added to an internal buffer (deduplicated). The orchestrator sees only match counts, not the log lines.

**Input Schema:**

```json
{
	"query": "string (regex pattern)",
	"maxResults": "number (default: 200)"
}
```
````

**Returns to orchestrator:** `{ matchCount, newLinesAdded, totalBufferSize, bufferApproxTokens }`. No raw log content.

### 3.3 `compress_logs`

**Description:** Sends the search buffer to a small compressor model with instructions. The compressed output is cached for submission. The orchestrator sees only stats.

**Input Schema:**

```json
{
	"instructions": "string (what to focus on, feedback to address)",
	"mergeWithPrevious": "boolean (default: false, merge new findings with previous compression)"
}
```

**Returns to orchestrator:** `{ lineCount, tokenCount, withinLimit }`. No compressed log content.

### 3.4 `clear_search_buffer`

**Description:** Clears the internal search buffer. Use before starting a fresh set of searches.

**Input Schema:** `{}` (no parameters)

**Returns:** `{ cleared: true, previousSize }`

### 3.5 `submit_answer`

**Description:** Submits the cached compressed logs to Centrala. No parameters needed — uses the latest compression output automatically.

**Input Schema:** `{}` (no parameters)

**Returns to orchestrator:** `{ success, flagFound, flag?, response }`. The response field contains technician feedback or the flag.

---

## 4. Execution Flow

```text
START
  │
  ├─ 1. Orchestrator calls fetch_logs → gets metadata (line count, timestamps)
  │
  ├─ 2. Orchestrator calls search_logs ("WARN|ERRO|CRIT") → gets match count
  │     (matched lines stored in internal buffer, invisible to orchestrator)
  │
  ├─ 3. Orchestrator calls compress_logs with instructions
  │     → Small model compresses buffer → cached → orchestrator sees token count
  │
  ├─ 4. Orchestrator calls submit_answer → cached compressed logs sent automatically
  │
  ├─ 5. Check response:
  │     ├─ Flag found → log flag, exit(0) ✓
  │     └─ Feedback received → orchestrator reads feedback
  │           ├─ Orchestrator calls search_logs with targeted queries
  │           ├─ Orchestrator calls compress_logs (mergeWithPrevious=true) with feedback
  │           └─ Go to step 4 (max 5 retries)
  │
  └─ END (flag captured or max retries exhausted)
```

### Key Decision Points

- **Two-model split**: Big model orchestrates, small model compresses. Raw logs never enter the orchestrator context.
- **Search buffer**: Accumulates results from multiple `search_logs` calls. Deduplicated automatically.
- **Cached compression**: `compress_logs` output is cached and auto-attached to `submit_answer`.
- **Feedback loop**: Technician feedback goes to orchestrator, which issues targeted searches and re-compresses.
- **Flag detection**: Programmatic regex match on `\{FLG:[^}]+\}` — not LLM-based.

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
OPENAI_COMPRESSOR_MODEL=gpt-4.1-mini
AI_DEVS_API_KEY=your-ai-devs-api-key-here
AI_DEVS_TASK_NAME=failure
```

### Project Structure

```text
src/
  index.ts          # Entry point — bootstraps and runs the agent
  agent.ts          # Agent loop: orchestrator model + tool dispatch
  tools.ts          # Tool definitions and handlers (buffer, cache, API calls)
  compressor.ts     # Small model compression logic
  prompts.ts        # System prompts for orchestrator and compressor
  logger.ts         # Structured logging (agent/tool/api levels)
```

---

## 6. Key Implementation Notes

1. **Dual-model architecture**: Orchestrator (big model) never sees raw logs — only metadata. Compressor (small model) handles compression internally.
2. **Search buffer pattern**: `search_logs` adds matching lines to a buffer. `compress_logs` processes the buffer. `clear_search_buffer` resets it.
3. **Cached compression**: Compressed output is cached in a module-level variable and auto-attached to `submit_answer`.
4. **Conservative token heuristic**: Use 3.5 chars/token to avoid exceeding the 1500 token hard limit.
5. **Flag capture is programmatic**: Parse response text with regex `\{FLG:[^}]+\}`. Log and exit immediately.
6. **Tool schemas use zod**: Input validation for tool parameters.
7. **Structured logging**: Three categories — `agent`, `tool`, `api`.
8. **Feedback-driven refinement**: Orchestrator reads feedback, searches for missing subsystems, compresses with `mergeWithPrevious=true`.
9. **Token savings**: Big model context stays small since it never processes raw log text, only short JSON metadata.

---

## 7. Acceptance Criteria

- [x] Agent fetches the full log file from the remote URL
- [x] Regex pre-filter extracts WARN/ERRO/CRIT events into search buffer
- [x] Small model compresses filtered events to ≤1500 tokens
- [x] Token count is verified before each submission (by compressor)
- [x] Agent submits cached compressed logs to Centrala verify endpoint
- [x] Agent reads feedback and refines logs (up to 5 retries)
- [x] Flag is captured programmatically via regex and logged
- [x] Process exits with code 0 after flag capture
- [x] Structured logging with agent/tool/api categories
- [x] All code in TypeScript, no semicolons, SOLID principles
- [x] Environment variables managed via dotenv
- [x] Dual-model split: orchestrator never sees raw log content
- [x] Compressed output cached and auto-attached to submissions
