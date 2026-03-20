# AI Agent for Drone Mission (Task: `drone`)

## 1. Overview & Goal

### Task Summary

The agent must program an armed drone (DRN-BMB7) to bomb a **dam** near the Żarnowiec power plant — not the power plant itself. The dam's destruction will route water into the cooling system. The agent analyzes a grid map to locate the dam sector, constructs drone API instructions targeting that sector, sends them to the `/verify` endpoint, and iteratively adjusts based on API error feedback until a flag (`{FLG:...}`) is captured.

### Hardcoded Inputs / Initial Data

| Field                 | Value                                         |
| --------------------- | --------------------------------------------- |
| Power plant ID        | `PWR6132PL`                                   |
| Task name             | `drone`                                       |
| Drone API docs (HTML) | `***hub_endpoint***/dane/drone.html`          |
| Map URL template      | `***hub_endpoint***/data/{API_KEY}/drone.png` |
| Verify endpoint       | `{AI_DEVS_HUB_ENDPOINT}/verify`               |

### Final Deliverable

A POST request to `/verify` with a JSON payload containing drone instructions that target the dam sector. The API returns `{FLG:...}` on success — the flag must be extracted programmatically via regex, logged, and the process must exit with code `0`.

---

## 2. Agent Persona & Prompt Strategy

### System Prompt (for the inner LLM agent)

```markdown
You are a drone mission planner. Your objective is to send a drone to destroy a dam near the Żarnowiec power plant to enable water flow into the cooling system.

## Mission Parameters

- The power plant identification code is: PWR6132PL
- You must target the dam — NOT the power plant itself.

## Your Workflow

1. First, call `fetchDroneDocumentation` to learn the drone API and available commands.
2. Call `analyzeMap` to study the terrain map and identify the dam's location on the grid.
3. Based on the documentation and map analysis, construct a drone instruction sequence.
4. Call `sendInstructions` with your instruction array.
5. If the API returns an error, read the error message carefully, adjust the instructions, and retry.
6. Continue until the flag is captured or you exhaust retries.

## Rules

- ONLY target the dam — never the power plant directly.
- Keep the instruction set minimal — only include what's needed for the mission.
- You MUST read the drone documentation before constructing any instructions.
- You MUST analyze the map before choosing a target sector.
- Read API error messages carefully — they are specific and actionable.
```

### Prompt Design Notes

- The system prompt does **not** embed drone API documentation. The agent must discover the API by fetching the documentation via the `fetchDroneDocumentation` tool. This forces autonomous learning and avoids pre-baking potentially stale or incomplete information.
- The workflow section guides the agent through a discovery-first approach: learn the API, analyze the map, then act.
- The reactive/iterative strategy is preserved — errors from the `/verify` endpoint guide corrections.

---

## 3. Tool Definitions (Function Calls)

### 3.1 `fetchDroneDocumentation`

**Description:** Fetches the drone API documentation HTML page and returns parsed text content for the agent to learn available commands and their usage.

**Input Schema:**

```json
{
	"type": "object",
	"properties": {},
	"required": []
}
```

No parameters — the documentation URL is constructed from config.

**Behavior:**

1. Constructs the documentation URL: `{AI_DEVS_HUB_ENDPOINT}/dane/drone.html`
2. Fetches the HTML page via axios
3. Strips HTML tags and extracts plain text content
4. Logs via `logger.tool`

**Return value:**

```json
{
	"documentation": "Parsed plain-text content of the drone API documentation page"
}
```

### 3.2 `analyzeMap`

**Description:** Sends the drone mission map image to a vision model for analysis. Returns the model's description of what it sees on the map.

**Input Schema:**

```json
{
	"type": "object",
	"properties": {},
	"required": []
}
```

No parameters — the map URL is constructed from config.

**Behavior:**

1. Constructs the map URL: `{AI_DEVS_HUB_ENDPOINT}/data/{AI_DEVS_API_KEY}/drone.png`
2. Calls the vision model (`OPENAI_VISION_MODEL`) with the image URL and a prompt asking to describe the map in detail — including any grid structure, labeled features, water bodies, structures, and notable visual elements
3. Validates the response with Zod schema
4. Logs the analysis result via `logger.tool`

**Return value:**

```json
{
	"description": "Detailed vision model description of the map contents"
}
```

### 3.3 `sendInstructions`

**Description:** Sends drone instructions to the `/verify` API endpoint and returns the response. Detects flags in the response.

**Input Schema:**

```json
{
	"type": "object",
	"properties": {
		"instructions": {
			"type": "array",
			"items": { "type": "string" },
			"description": "Array of drone instruction strings to send, e.g. [\"setDestinationObject(PWR6132PL)\", \"set(3,2)\", \"set(engineON)\", \"set(50m)\", \"set(destroy)\", \"flyToLocation\"]"
		}
	},
	"required": ["instructions"]
}
```

**Behavior:**

1. Validates the `instructions` array with Zod (non-empty array of strings)
2. Constructs the POST payload:
   ```json
   {
   	"apikey": "{AI_DEVS_API_KEY}",
   	"task": "drone",
   	"answer": {
   		"instructions": ["..."]
   	}
   }
   ```
3. POSTs to the verify endpoint via axios
4. Logs request and response via `logger.api`
5. Checks response text for flag pattern `\{FLG:[^}]+\}` via regex
6. If flag found: logs it via `logger.agent` and immediately calls `process.exit(0)`

**Return value:**

```json
{
	"response": "Raw API response text or JSON stringified",
	"flagFound": false
}
```

---

## 4. Execution Flow

```text
START
  │
  ├─ 1. Load config, initialize OpenAI client
  │
  ├─ 2. Build system prompt (mission objective only, no API docs)
  │
  ├─ 3. Initialize conversation with system prompt
  │
  ├─ 4. AGENT LOOP (max 10 iterations)
  │     │
  │     ├─ Send messages to OpenAI Chat Completions (with tools)
  │     │
  │     ├─ IF model calls tool:
  │     │     ├─ fetchDroneDocumentation → fetch & parse HTML docs
  │     │     ├─ analyzeMap → call vision model, return map description
  │     │     └─ sendInstructions → POST to /verify, check for flag
  │     │           ├─ FLAG FOUND → log flag, process.exit(0)
  │     │           └─ ERROR → return error message to agent
  │     │
  │     ├─ Append tool results to conversation
  │     │
  │     └─ CONTINUE LOOP (model decides next action)
  │
  ├─ 5. If max iterations reached without flag → log error, exit(1)
  │
  └─ END
```

### Key Decision Points

1. **Documentation discovery** — The agent must fetch and understand the drone API documentation before constructing any instructions. The documentation contains traps (overlapping method names). The agent must reason about which commands are relevant to the mission.

2. **Map analysis accuracy** — The grid sector identification is critical. The vision model must describe the map thoroughly enough for the agent to determine the dam's coordinates. If the first analysis seems wrong (API errors about invalid coordinates), the agent should re-analyze or try adjacent sectors.

3. **Instruction construction** — The agent must synthesize information from the documentation and map analysis to build the correct instruction sequence. There is no pre-baked knowledge about what commands to use or in what order — the agent learns this from the docs and error feedback.

4. **Error recovery** — If multiple errors pile up, the agent should consider using a factory reset command (if the docs describe one) to clear corrupted state before retrying.

5. **Flag detection** — Must be done via regex `\{FLG:[^}]+\}` on the raw response text — never via LLM interpretation (per AGENTS.md rules).

---

## 5. Dependencies & Environment

### package.json additions

No new packages needed — the existing dependencies cover all requirements:

| Package  | Purpose                                          |
| -------- | ------------------------------------------------ |
| `openai` | OpenAI API client (chat completions + vision)    |
| `axios`  | HTTP requests to `/verify` endpoint              |
| `zod`    | Schema validation for tool I/O and API responses |
| `dotenv` | Environment variable management                  |

### Environment Variables (`.env`)

```env
OPENAI_API_KEY=your-openai-api-key-here
OPENAI_BASE_URL=https://api.openai.com/v1          # optional, for proxy/custom endpoints
OPENAI_MODEL=gpt-5-mini                             # model for agent reasoning
OPENAI_VISION_MODEL=gpt-5.4                         # model for map image analysis
AI_DEVS_API_KEY=your-ai-devs-api-key-here
AI_DEVS_TASK_NAME=drone
AI_DEVS_HUB_ENDPOINT=***hub_endpoint***
```

### Project Structure

```text
src/
  index.ts              # Entry point — initializes client, runs agent
  agent.ts              # Agent loop with OpenAI function-calling dispatch
  config.ts             # Configuration (extend with visionModel, hubDataEndpoint)
  logger.ts             # Structured logging (reuse as-is)
  prompts.ts            # System prompt builder
  types.ts              # Zod schemas and TypeScript types
  tools/
    fetchDroneDocumentation.ts  # Fetch & parse drone API HTML docs
    analyzeMap.ts               # Vision model map analysis tool
    sendInstructions.ts         # Verify endpoint interaction tool
```

---

## 6. Key Implementation Notes

1. **Vision model URL pass-through** — Send the map image URL directly to the OpenAI vision API as an `image_url` content part. Do not download the image. The URL includes the API key, so it is authenticated.

2. **HTML documentation parsing** — The `fetchDroneDocumentation` tool must strip HTML tags and return clean text. A simple regex-based HTML-to-text extraction is sufficient (no need for a full HTML parser library). The agent will reason about the parsed documentation to identify relevant commands.

3. **No pre-baked drone knowledge** — The system prompt and tool descriptions must NOT contain any drone API method names, parameter formats, or command examples. The agent discovers all of this from the documentation. This ensures the agent can adapt if the API changes.

4. **Flag extraction** — Use regex `/\{FLG:[^}]+\}/` on raw response text. On match, log via `logger.agent('info', 'Flag captured', { flag })` and call `process.exit(0)` immediately. Never rely on the LLM to extract or report the flag.

5. **Max iterations** — Cap the agent loop at 10 iterations. This prevents infinite loops and excessive token usage. Log a clear error if exhausted.

6. **Tool registration** — Use the `ChatCompletionTool` type from the `openai` package. Define tool functions with `function` type, name, description, and `parameters` matching the JSON schemas in section 3.

7. **Conversation history** — Maintain the full message array across iterations so the agent has context of previous attempts and errors. This enables the reactive/iterative strategy.

8. **Reactive approach** — The documentation intentionally contains traps and overlapping method names. The agent should use error feedback from the `/verify` endpoint to iteratively refine its instruction set rather than trying to parse every nuance of the docs upfront.

---

## 7. Acceptance Criteria

- [ ] Agent fetches and parses the drone API documentation autonomously
- [ ] Agent analyzes the map image using a vision model and identifies the dam location
- [ ] Agent synthesizes documentation + map analysis to construct a valid drone instruction sequence
- [ ] Agent sends instructions to `/verify` and handles error responses by adjusting and retrying
- [ ] Flag `{FLG:...}` is captured via regex (not LLM), logged via `logger.agent`, and process exits with code `0`
- [ ] All 3 log categories are used: `agent` (decisions), `tool` (executions), `api` (HTTP requests/responses)
- [ ] Logs include timestamps, levels, and relevant context
- [ ] Environment variables follow `.env.example` pattern with `OPENAI_VISION_MODEL` added
- [ ] Zod validates tool inputs/outputs and API payloads
- [ ] Code uses TypeScript, no semicolons, English variable names, SOLID principles
- [ ] Max 10 agent loop iterations with clear error logging on exhaustion
