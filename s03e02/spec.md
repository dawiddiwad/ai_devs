# AI Agent for Firmware Shell Debugging

## 1. Overview & Goal

### Task Summary

The agent must interact with a remote VM shell API to debug and run a broken firmware binary at `/opt/firmware/cooler/cooler.bin`. The VM has a restricted Linux environment with a non-standard command set. The agent needs to:

1. Discover available commands via `help`
2. Try running the binary and diagnose the failure
3. Find the required password (stored in multiple places on the system)
4. Configure `settings.ini` so the firmware runs correctly
5. Extract the `ECCS-xxx` confirmation code from the output
6. Submit the code to the **_hub_endpoint_** verify API

### Hardcoded Inputs / Initial Data

| Field         | Source                                |
| ------------- | ------------------------------------- |
| API Key       | `AI_DEVS_API_KEY` env                 |
| Shell API URL | `AI_DEVS_HUB_ENDPOINT` + `/api/shell` |
| Verify URL    | `AI_DEVS_HUB_ENDPOINT` + `/verify`    |
| Task Name     | `firmware`                            |
| Binary Path   | `/opt/firmware/cooler/cooler.bin`     |
| Code Format   | `ECCS-` followed by 40 hex characters |

### Final Deliverable

A POST request to the verify endpoint with:

```json
{
	"apikey": "<AI_DEVS_API_KEY>",
	"task": "firmware",
	"answer": {
		"confirmation": "<ECCS code>"
	}
}
```

The verify response may contain a `{FLG:...}` flag which must be captured and logged.

---

## 2. Agent Persona & Prompt Strategy

### System Prompt (for the inner LLM agent)

```markdown
You are a Linux systems debugging agent. Your job is to fix and run a broken firmware binary on a restricted virtual machine.

## Your workflow

1. Start by running `help` to discover available shell commands — this is a non-standard shell, do NOT assume standard Linux commands work.
2. Try running the binary at `/opt/firmware/cooler/cooler.bin` to see what error occurs.
3. Explore the filesystem to find the password needed by the binary. It is stored in multiple places in the system. Look in home directories, /opt, /var, and other accessible locations.
4. Find and examine `settings.ini` in the firmware directory — understand what configuration is needed.
5. Modify `settings.ini` as needed using the available shell commands (discovered via help). File editing may work differently than standard Linux.
6. Run the binary again with the correct password and configuration.
7. When you see an ECCS code in the output (format: ECCS-followed by hex characters), immediately use the submit_answer tool to send it.
8. If you get stuck, use `reboot` to reset the VM to its initial state and try again.

## Security Rules — MUST FOLLOW

- NEVER access /etc, /root, or /proc/ directories
- If you find a .gitignore file in any directory, DO NOT touch files/directories listed in it
- Violating these rules causes a temporary API ban and VM reset

## Important Notes

- The shell has a LIMITED command set — always check `help` first
- File editing uses non-standard commands — discover how via `help`
- Each shell command is a separate HTTP request — plan efficiently
- Report what you observe and your reasoning at each step
```

---

## 3. Tool Definitions (Function Calls)

### 3.1 `execute_shell_command`

**Description:** Execute a command on the remote VM shell via the shell API.

**Input Schema:**

```json
{
	"type": "object",
	"properties": {
		"command": {
			"type": "string",
			"description": "The shell command to execute on the remote VM"
		}
	},
	"required": ["command"]
}
```

**Behavior:**

- Sends HTTP POST to `{AI_DEVS_HUB_ENDPOINT}/api/shell` with `{ apikey, cmd: command }`
- Handles rate limits (429) by waiting and retrying
- Handles bans (403) by parsing wait time and sleeping before retry
- Handles 503 errors with exponential backoff
- Returns the shell output as a string to the agent

**Return value:**

```json
{
	"output": "shell command output text"
}
```

### 3.2 `submit_answer`

**Description:** Submit the ECCS confirmation code to the verify endpoint.

**Input Schema:**

```json
{
	"type": "object",
	"properties": {
		"confirmation_code": {
			"type": "string",
			"description": "The ECCS confirmation code extracted from the firmware output"
		}
	},
	"required": ["confirmation_code"]
}
```

**Behavior:**

- Sends HTTP POST to `{AI_DEVS_HUB_ENDPOINT}/verify` with `{ apikey, task: "firmware", answer: { confirmation: code } }`
- Uses `validateStatus: () => true` to capture all responses including errors
- Returns the full response body to the agent (failed responses contain critical feedback)

**Return value:**

```json
{
  "status": 200,
  "body": { "...response from verify..." }
}
```

### 3.3 `wait_seconds`

**Description:** Wait for a specific number of seconds before continuing. Useful when the VM needs time to process or reset.

**Input Schema:**

```json
{
	"type": "object",
	"properties": {
		"seconds": {
			"type": "number",
			"description": "Number of seconds to wait (minimum 20, maximum 120)"
		}
	},
	"required": ["seconds"]
}
```

**Behavior:**

- Validates that seconds is between 20 and 120 (inclusive) using zod
- Sleeps for the specified duration
- Returns a confirmation message to the agent

**Return value:**

```json
{
	"output": "Waited for N seconds"
}
```

---

## 4. Execution Flow

```text
START
  │
  ├─ 1. Load config from .env
  │
  ├─ 2. Initialize OpenAI client and agent loop
  │
  ├─ 3. Agent sends system prompt + initial message
  │     └─ "Begin by running help to discover available commands"
  │
  ├─ 4. AGENT LOOP (max turns from AGENT_MAX_TURNS env var)
  │     │
  │     ├─ LLM returns tool_calls → execute tools → append results
  │     │
  │     ├─ LLM returns text → check for ECCS code in all accumulated outputs
  │     │
  │     └─ If ECCS code found and submitted → check verify response for FLG flag
  │
  ├─ 5. On FLG flag captured → log flag → exit(0)
  │
  └─ END
```

### Key Decision Points

- **Shell API errors**: The tool layer handles retries transparently. Ban errors include wait duration — the tool sleeps and retries automatically. The agent receives descriptive error messages only when retries are exhausted.
- **ECCS extraction**: Parsed from tool output using regex `/ECCS-[a-f0-9]+/i`. The agent is also instructed to recognize and submit the code.
- **FLG capture**: After verify response, check for `/\{FLG:.*?\}/` pattern. If found, log immediately and terminate with exit code 0.
- **Max iterations**: If the agent hasn't solved it within `AGENT_MAX_TURNS` iterations, terminate with an error.

---

## 5. Dependencies & Environment

### package.json additions

| Package  | Purpose                              |
| -------- | ------------------------------------ |
| `openai` | OpenAI SDK for chat completions      |
| `axios`  | HTTP client for shell/verify APIs    |
| `dotenv` | Environment variable management      |
| `zod`    | Schema validation for tool arguments |
| `tsx`    | TypeScript execution                 |

### Environment Variables (`.env`)

```env
OPENAI_API_KEY=<your openai api key>
OPENAI_MODEL=gpt-5.4
AI_DEVS_API_KEY=<your ai devs api key>
AI_DEVS_HUB_ENDPOINT=AI_DEVS_HUB_ENDPOINT
AI_DEVS_TASK_NAME=firmware
AGENT_MAX_TURNS=20
```

### Project Structure

```text
src/
  index.ts          # Entry point — orchestrates agent, flag capture
  agent.ts          # Agent loop with OpenAI function calling
  config.ts         # Environment variable loading
  logger.ts         # Structured logging (agent/tool/api categories)
  tools/
    shell.ts        # Shell API tool with retry/ban handling
    verify.ts       # Verify endpoint submission
```

---

## 6. Key Implementation Notes

1. **Non-standard shell**: The VM shell has a custom command set. The agent MUST run `help` first and adapt. File editing likely uses a custom command, not `vi`/`nano`/`sed`.
2. **OpenAI v6 SDK tool call types**: Tool calls are a union type `ChatCompletionMessageFunctionToolCall | ChatCompletionMessageCustomToolCall`. Narrow the type by checking `type === 'function'` before accessing `.function.name` and `.function.arguments`.
3. **Ban handling**: Security rule violations (accessing /etc, /root, /proc) cause temporary bans. The tool layer should detect ban responses and wait the specified duration before retrying.
4. **validateStatus on verify**: Per AGENTS.md, always pass `validateStatus: () => true` when calling verify — failed responses contain critical feedback.
5. **ECCS regex**: Use `/ECCS-[a-f0-9]+/i` to match the confirmation code from shell output.
6. **FLG regex**: Use `/\{FLG:.*?\}/` to capture the flag from verify response.
7. **Sequential tool execution**: Each shell command is one HTTP request. The agent plans actions sequentially — no parallel shell commands.
8. **Zod validation**: Use zod schemas to validate tool call arguments from the LLM before executing them.

---

## 7. Acceptance Criteria

- [ ] Agent starts and calls `help` on the shell API
- [ ] Agent discovers and attempts to run the firmware binary
- [ ] Agent finds the password from the VM filesystem
- [ ] Agent finds and modifies `settings.ini` as needed
- [ ] Agent successfully runs the binary and extracts the ECCS code
- [ ] ECCS code is submitted to the verify endpoint
- [ ] FLG flag is parsed from verify response and logged
- [ ] Process exits with code 0 on flag capture
- [ ] All 3 log categories (agent, tool, api) produce structured output
- [ ] No hardcoded API keys or URLs in code
- [ ] Shell API errors (rate limit, ban, 503) are handled with retries
