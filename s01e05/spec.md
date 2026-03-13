# AI Agent for Railway Route Activation

## 1. Overview & Goal

### Task Summary
The agent must activate railway route **X-01** by interacting with a self-documenting API at `https://***hub_endpoint***/verify`. The API has no external documentation — the agent starts by calling the `help` action, reads the returned documentation, and follows the described sequence of actions to complete the activation. The API simulates overload (503 errors) and enforces strict rate limits, so the agent must handle retries and respect rate-limit headers.

### Hardcoded Inputs / Initial Data

| Field         | Value                              |
|---------------|------------------------------------|
| API Endpoint  | `https://***hub_endpoint***/verify`    |
| Task Name     | `railway`                          |
| Route to Activate | `X-01`                         |
| API Key       | Loaded from `AIDEVS_API_KEY` env var |

### Final Deliverable
The agent retrieves a flag in the format `{FLG:...}` from the API response, which confirms the railway route has been successfully activated. The flag is printed to the console.

---

## 2. Agent Persona & Prompt Strategy

### System Prompt (for the inner LLM agent)

```markdown
You are a Railway API Navigator Agent. Your job is to interact with a self-documenting railway API to activate route X-01.

## Your workflow of agent loop
1. Call the `help` action to retrieve the API documentation.
2. Parse the documentation to determine the exact sequence of actions, their parameters, and order required to activate route X-01.
3. Execute each action in the correct order, passing the exact parameter names and values specified by the API documentation.
4. After each API call, inspect the response for next steps, errors, or the final flag.
5. If you receive an error, read the error message carefully and adjust your next action accordingly.
6. When the response contains a flag in the format `{FLG:...}`, report it and stop.

## Rules
- ALWAYS start with the `help` action — never guess action names or parameters.
- Use EXACTLY the action names, parameter names, and values described in the API documentation.
- NEVER make redundant or speculative API calls — every call counts against the rate limit.
- If an action fails, read the error message and fix your approach before retrying.
- Be patient with 503 errors and rate limits — wait the required time before retrying.
```

---

## 3. Tool Definitions (Function Calls)

### 3.1 `callRailwayApi`

**Description:** Sends a POST request to the railway API endpoint with the given action and optional parameters.

**Input Schema:**
```json
{
  "type": "object",
  "properties": {
    "action": {
      "type": "string",
      "description": "The API action to invoke (e.g. 'help', or any action discovered from the help response)"
    },
    "params": {
      "type": "object",
      "description": "Optional additional parameters for the action, as key-value pairs discovered from API documentation"
    }
  },
  "required": ["action"]
}
```

**Behavior:**
1. Constructs the JSON body: `{ "apikey": "<AIDEVS_API_KEY>", "task": "railway", "answer": { "action": "<action>", ...params } }`.
2. Sends a POST request to `https://***hub_endpoint***/verify`.
3. If the response is 503, waits with exponential backoff and retries (up to a configured max retries).
4. After each response, reads rate-limit headers and waits until the reset time before allowing the next call.
5. Logs the full request and response (status, headers, body) for debugging.

**Return value:**
```json
{
  "status": 200,
  "data": { "...": "API response body" },
  "rateLimitReset": 1234567890
}
```

---

## 4. Execution Flow

```text
START
  │
  ├─ 1. Send action "help" → receive API documentation
  │
  ├─ 2. Pass documentation to LLM → LLM determines the sequence of actions
  │     needed to activate route X-01
  │
  ├─ 3. AGENT LOOP: LLM picks the next action based on API docs + prior responses
  │     │
  │     ├─ 3a. Call the chosen action via callRailwayApi
  │     │
  │     ├─ 3b. If 503 → retry with backoff (handled inside the tool)
  │     │
  │     ├─ 3c. If rate-limited → wait until reset, then retry
  │     │
  │     ├─ 3d. If error response → feed error to LLM, loop back to 3
  │     │
  │     ├─ 3e. If success → feed response to LLM, loop back to 3
  │     │
  │     └─ 3f. If response contains {FLG:...} → extract and report flag
  │
  └─ END (flag found and printed)
```

### Key Decision Points
- **After `help` response:** The LLM must correctly parse the self-documentation to determine the full activation workflow. This is the most critical step — misinterpreting the docs wastes rate-limited calls.
- **503 handling:** Must be automatic with exponential backoff. Do not count 503 retries as separate agent decisions.
- **Rate limit handling:** Read `X-RateLimit-Reset` (or similar) headers from every response. Calculate the wait time and sleep before the next request. Never fire a request before the rate limit window resets.
- **Error responses (non-503):** Feed the full error message back to the LLM so it can self-correct. Do not blindly retry the same call.

---

## 5. Dependencies & Environment

### package.json additions
| Package   | Purpose                                          |
|-----------|--------------------------------------------------|
| `axios`   | HTTP client for API calls                        |
| `dotenv`  | Load environment variables from `.env`           |
| `openai`  | LLM integration for agent reasoning              |

### Environment Variables (`.env`)
```env
AI_DEVS_API_KEY=<your ***hub_url*** hub API key>
OPENAI_API_KEY=<your OpenAI API key>
```

### Project Structure
```text
src/
  index.ts          # Entry point — bootstraps and runs the agent loop
  agent.ts          # Agent loop logic: LLM interaction, decision-making
  api-client.ts     # Railway API client with retry/rate-limit handling
  tools.ts          # Tool definitions for the LLM (callRailwayApi)
  prompts.ts        # System and user prompt templates
  types.ts          # Shared TypeScript interfaces and types
```

---

## 6. Key Implementation Notes

1. **Start with `help` — always.** The API is self-documenting. The `help` response contains the full specification of available actions, their parameters, and the required order. Do not hardcode any action names or parameters beyond `help` itself.
2. **Rate limits are the main constraint.** After every API response, inspect the response headers for rate-limit information (e.g. `X-RateLimit-Remaining`, `X-RateLimit-Reset`, `Retry-After`). Calculate the required wait time and enforce it before the next request.
3. **503 errors are expected and must be retried.** Use exponential backoff (e.g. 1s, 2s, 4s, 8s…) with a maximum number of retries. Do not treat 503 as a fatal error.
4. **Log every request and response.** Include timestamp, HTTP method, URL, request body, response status, response headers (especially rate-limit headers), and response body. This is essential for debugging under rate-limit constraints.
5. **Minimize total API calls.** Every wasted call costs time waiting for rate-limit resets. The LLM should reason carefully from the `help` docs and plan the full sequence before starting, rather than exploring the API trial-and-error.
6. **Parse rate-limit headers defensively.** Header names and formats may vary. Check for common patterns: `Retry-After`, `X-RateLimit-Reset`, `RateLimit-Reset`. The reset value may be a Unix timestamp or seconds-to-wait.
7. **The flag format is `{FLG:...}`.** Scan every API response body for this pattern. When found, print it and terminate.

---

## 7. Acceptance Criteria
- [ ] Agent starts by calling the `help` action and correctly parses the API documentation
- [ ] Agent follows the exact sequence of actions described in the API documentation to activate route X-01
- [ ] 503 errors are automatically retried with exponential backoff
- [ ] Rate-limit headers are respected — no requests are sent before the limit resets
- [ ] Every API request and response is logged with timestamps and headers
- [ ] The agent extracts and prints the `{FLG:...}` flag upon successful activation
- [ ] The solution handles unexpected errors gracefully without crashing

## 8. Coding Standards (do not change):
1. Language: Write all code (including variable names and functions) in English.
2. Modularity: Organize the code into logical modules; do not put everything in a single index.ts file.
3. Tech Stack: Use TypeScript.
4. Environment Setup: Use the dotenv package to manage environment variables.
5. Architecture: Apply SOLID principles throughout the codebase.
6. Clean Code: Write self-explanatory code and do not use inline comments.
7. Formatting: Do not use semicolons at the end of lines.
8. Use package.json as a baseline, feel free to extend if needed.
