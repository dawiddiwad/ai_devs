# AI Agent for Categorize

## 1. Overview & Goal

### Task Summary
The agent must classify 10 items from a CSV file as dangerous (`DNG`) or neutral (`NEU`) by crafting a short prompt (≤100 tokens) sent to a remote classification hub. The hub feeds the prompt to a limited internal LLM. The agent operates in an iterative loop: reset → fetch CSV → send 10 classification requests → read hub feedback → refine prompt if needed → repeat until a flag is returned.

Critical twist: items related to a **reactor** (e.g. reactor cassettes / fuel rods) must **always** be classified as `NEU` regardless of their actual danger level.

### Hardcoded Inputs / Initial Data

| Field | Value |
|---|---|
| Task name | `categorize` |
| CSV endpoint | `https://***hub_endpoint***/data/{API_KEY}/categorize.csv` |
| Verify endpoint | `https://***hub_endpoint***/verify` |
| API key | loaded from `API_KEY` env variable |
| Token budget | 1.5 PP per full run (10 requests) |
| Max prompt tokens | 100 (including item id + description) |

### Final Deliverable
A successful run where all 10 items are correctly classified and the hub returns a flag `{FLG:...}` printed to stdout.

---

## 2. Agent Persona & Prompt Strategy

### Architecture: LLM-Driven Agent Loop

The program runs an **LLM agent loop** using the OpenAI SDK (chat completions with tool calling). The LLM acts as a "prompt engineer" agent that:
1. Designs a classification prompt template.
2. Executes a full classification cycle by calling tools.
3. Reads tool responses to evaluate whether the prompt worked.
4. If any classification fails, analyzes the failure, adjusts the prompt, and retries with a freshly fetched CSV.

The agent continues looping until it receives the flag or exhausts the retry limit.

### System Prompt (for the LLM agent)

The system prompt must instruct the LLM agent about:
- Its role as a prompt engineer for a classification task.
- The classification rules: dangerous items (`DNG`) vs neutral items (`NEU`).
- The critical reactor exception: any item related to a reactor (kaseta, reaktor, pręt paliwowy, fuel rod, etc.) must **always** be classified as `NEU`.
- The 100-token constraint for the classification prompt (including item id and description).
- The prompt template format: static instructions first (for caching), variable data (`{id}`, `{description}`) at the end.
- That it must use English in the classification prompt to save tokens.
- The available tools and when to call them.
- That on failure it must reset the budget, fetch fresh CSV data, refine the prompt, and retry.

### Classification Prompt Constraints

The classification prompt (what gets sent to the hub's internal model) must:
1. Fit within **100 tokens** including the item id and description.
2. Output exactly one word: `DNG` or `NEU`.
3. Classify weapons, explosives, toxic chemicals, radioactive materials etc. as `DNG`.
4. Classify harmless everyday items as `NEU`.
5. **Exception:** anything mentioning a reactor (kaseta, reaktor, pręt paliwowy, fuel rod, etc.) must be classified as `NEU`.
6. Be written in **English** to save tokens.
7. Place static instruction text first (for prompt caching) and variable data (id, description) at the end.

Example initial prompt template the agent might try:

```
Classify item as DNG (dangerous: weapons,explosives,toxic,radioactive) or NEU (safe). Exception: reactor parts are always NEU. Reply one word.
Item {id}: {description}
```

The LLM agent is free to modify this template based on hub feedback.

---

## 3. Tool Definitions (OpenAI Function-Calling Tools)

These tools are registered with the OpenAI chat completions API via the `tools` parameter. The LLM agent calls them by name and receives their output as tool-call results in the conversation. Each tool is backed by a TypeScript function that performs the actual HTTP request.

### 3.1 `reset_and_fetch_csv`

**Description:** Resets the token budget on the hub and fetches the latest CSV with 10 items. Call this before starting a new classification cycle.

**Parameters:** none

**Behavior:**
1. POST to `https://***hub_endpoint***/verify` with body:
   ```json
   { "apikey": "{apiKey}", "task": "categorize", "answer": { "prompt": "reset" } }
   ```
2. GET `https://***hub_endpoint***/data/{apiKey}/categorize.csv`
3. Parse CSV into an array of `{ id: string, description: string }` objects.

**Return value (to the LLM):** JSON string containing the reset confirmation and the list of 10 items with their ids and descriptions.

### 3.2 `classify_item`

**Description:** Sends a classification prompt for a single item to the hub and returns the hub's response. Use this to classify one item at a time.

**Parameters:**
| Name | Type | Required | Description |
|---|---|---|---|
| `prompt` | string | yes | The full classification prompt including instructions, item id, and item description. Must be ≤100 tokens. |

**Behavior:**
- POST to `https://***hub_endpoint***/verify` with body:
  ```json
  { "apikey": "{apiKey}", "task": "categorize", "answer": { "prompt": "{prompt}" } }
  ```
- Return the hub's raw JSON response (classification result, error message, or flag).

**Return value (to the LLM):** JSON string with the hub's response. This may contain:
- A classification result (`DNG` or `NEU`)
- An error message (e.g. wrong classification, budget exceeded)
- The final flag `{FLG:...}` after the last correctly classified item

---

## 4. Execution Flow

```text
START
  │
  ├─ 1. Load environment variables (API_KEY, OPENAI_API_KEY)
  │
  ├─ 2. Build system prompt for the LLM agent
  │
  ├─ 3. Register tools (reset_and_fetch_csv, classify_item)
  │
  ├─ 4. Start LLM agent loop:
  │     │
  │     │  The LLM agent autonomously:
  │     │
  │     ├─ a. Calls reset_and_fetch_csv tool
  │     │     → Receives list of 10 items
  │     │
  │     ├─ b. Designs/refines a classification prompt template
  │     │
  │     ├─ c. For each item, calls classify_item tool with the
  │     │     prompt (template filled with item id + description)
  │     │     → Reads hub response after each call
  │     │
  │     ├─ d. Evaluates results:
  │     │     ├─ If flag received → return flag → END
  │     │     ├─ If misclassification:
  │     │     │     ├─ Analyze which item failed and why
  │     │     │     ├─ Adjust prompt template
  │     │     │     └─ Call reset_and_fetch_csv (fresh data)
  │     │     │     └─ Retry from step (c)
  │     │     └─ If budget exhausted:
  │     │           ├─ Call reset_and_fetch_csv
  │     │           └─ Retry with optimized prompt
  │     │
  │     └─ e. Loop until flag or max iterations reached
  │
  ├─ 5. Extract flag from LLM's final message
  │
  └─ END (flag printed to stdout)
```

### LLM Agent Loop Implementation

The loop uses OpenAI's chat completions API with tool calling:
1. Send the conversation (system prompt + message history) to the LLM.
2. If the LLM returns tool calls, execute them and append tool results to the conversation.
3. If the LLM returns a text message (no tool calls), check if it contains the flag.
4. If the flag is found, print it and exit.
5. If no flag and max iterations not reached, continue the loop.
6. Cap the loop at a reasonable number of iterations (e.g. 10 LLM turns) to prevent runaway costs.

### Key Decision Points (handled by the LLM agent)

- **Prompt too long:** If the hub reports a token error, the agent should shorten the instruction text, use abbreviations, and minimize whitespace.
- **Reactor exception not triggering:** If a reactor-related item is classified as DNG, the agent should add more explicit keywords (kaseta, reaktor, pręt, fuel rod, reactor) to the exception list.
- **Budget exhausted:** The agent should call `reset_and_fetch_csv` and retry with an optimized prompt.
- **CSV changes:** The `reset_and_fetch_csv` tool always fetches fresh data, so each retry cycle operates on the latest items.

---

## 5. Dependencies & Environment

### package.json additions

| Package | Purpose |
|---|---|
| `axios` | HTTP requests to hub API and CSV endpoint (already in package.json) |
| `dotenv` | Load environment variables (already in package.json) |
| `openai` | OpenAI SDK for LLM agent loop with tool calling (already in package.json) |

No additional packages required.

### Environment Variables (`.env`)
```env
API_KEY=<your ag3nts.org api key>
OPENAI_API_KEY=<your OpenAI api key>
```

### Project Structure
```text
src/
  index.ts          # Entry point — sets up the agent and runs the loop
  agent.ts          # LLM agent loop: manages conversation, dispatches tool calls
  tools.ts          # Tool definitions (OpenAI function schemas) and tool handlers
  api.ts            # HTTP functions: fetchCsv, resetBudget, classifyItem
  parser.ts         # CSV parsing logic
  types.ts          # Shared TypeScript types/interfaces
```

---

## 6. Key Implementation Notes

1. The CSV file content **changes every few minutes**. The `reset_and_fetch_csv` tool always fetches fresh data, ensuring each retry cycle uses the latest items.
2. The 100-token limit is extremely tight. The LLM agent must be instructed about this constraint so it crafts concise prompts.
3. Place the static instruction portion **first** in the classification prompt so the hub can leverage prompt caching to reduce cost.
4. The reactor exception is the core challenge: items like "kaseta do reaktora" or "fuel rod" must be `NEU` even though they sound dangerous. The LLM agent's system prompt must emphasize this requirement.
5. Tool results are returned to the LLM as strings. The agent reads these to decide whether to continue classifying, adjust the prompt, or declare success.
6. Cap the agent loop at a reasonable number of iterations (e.g. 10 LLM turns) to prevent runaway API costs.
7. Every tool call result is logged to stdout for debugging.
8. The LLM agent does **not** classify items itself — it only crafts the prompt template. The actual classification is performed by the hub's internal model when the `classify_item` tool is called.

---

## 7. Acceptance Criteria

- [ ] LLM agent loop runs using OpenAI SDK with tool calling
- [ ] Agent has access to `reset_and_fetch_csv` and `classify_item` tools
- [ ] Agent fetches CSV data from the hub dynamically via tool call
- [ ] Agent resets budget before each full attempt via tool call
- [ ] Agent autonomously designs classification prompts that fit within 100 tokens
- [ ] Dangerous items (weapons, explosives, chemicals, radioactive) classified as `DNG`
- [ ] Neutral items (everyday objects) classified as `NEU`
- [ ] Reactor-related items always classified as `NEU` regardless of description
- [ ] Agent reads tool responses and evaluates classification results
- [ ] Agent automatically adjusts prompt and retries with fresh CSV on misclassification
- [ ] Flag `{FLG:...}` is printed to stdout on success
- [ ] Total token cost stays within 1.5 PP budget
- [ ] Agent loop is capped at a maximum number of iterations to prevent runaway costs

## 8. Coding Standards (do not change):
1. Language: Write all code (including variable names and functions) in English.
2. Modularity: Organize the code into logical modules; do not put everything in a single index.ts file.
3. Tech Stack: Use TypeScript.
4. Environment Setup: Use the dotenv package to manage environment variables.
5. Architecture: Apply SOLID principles throughout the codebase.
6. Clean Code: Write self-explanatory code and do not use inline comments.
7. Formatting: Do not use semicolons at the end of lines.
8. Use package.json as a baseline, feel free to extend if needed.
