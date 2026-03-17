# AI Agent for Electricity Puzzle

## 1. Overview & Goal

### Task Summary
The agent must solve a 3x3 electrical cable puzzle by rotating grid cells to route power from the emergency source (bottom-left) to three power plants (PWR6132PL, PWR1593PL, PWR7264PL). The board state is a PNG image — the agent delegates image analysis to a vision model via a tool, compares the described cable layout against the solved target, computes the minimum 90° clockwise rotations per cell, and sends rotation commands through the hub API.

### Hardcoded Inputs / Initial Data

| Field | Value |
|---|---|
| Task name | `electricity` |
| Board endpoint | `https://***hub_endpoint***/data/{API_KEY}/electricity.png` |
| Reset endpoint | `https://***hub_endpoint***/data/{API_KEY}/electricity.png?reset=1` |
| Target image | `https://***hub_endpoint***/i/solved_electricity.png` |
| Verify endpoint | `https://***hub_endpoint***/verify` |
| API key | loaded from `API_KEY` env variable |
| Grid size | 3×3 |
| Cell addressing | `AxB` — A = row (1-3, top→bottom), B = column (1-3, left→right) |

### Final Deliverable
The hub returns a flag `{FLG:...}` when the board matches the target configuration. The flag is printed to stdout.

---

## 2. Agent Persona & Prompt Strategy

### Architecture: LLM-Driven Agent Loop

The program runs an **LLM agent loop** using the OpenAI SDK (chat completions with tool calling). The main LLM agent reasons purely in text — it never sees images directly. Instead it:

1. Calls a tool that analyzes the solved target image → receives textual cable-connection descriptions per cell.
2. Calls a tool that analyzes the current board image → receives the same format.
3. Compares each cell's connections and computes the required number of 90° CW rotations (0–3).
4. Sends rotation commands via a rotate tool, checking every response for the flag.
5. Verifies the result by re-analyzing the board after all rotations.

Image analysis is fully delegated to a tool that internally calls a vision-capable model.

### System Prompt (for the LLM agent)

```markdown
You are an Electricity Puzzle Solver. Your job is to route power through a 3x3 cable grid by rotating cells.

## Board representation
Each cell is addressed as AxB (A=row 1-3 from top, B=column 1-3 from left).
Each cell's cable connections are described as a set of edges: T (top), R (right), B (bottom), L (left).

## Rotation mechanics
The only allowed operation is 90° clockwise rotation.
One rotation maps: T→R, R→B, B→L, L→T.
To rotate N times, call rotate_tile N separate times for that cell.

## Your workflow
1. Call analyze_target to get the solved cable connections for all 9 cells.
2. Call analyze_board to get the current cable connections for all 9 cells.
3. For each cell, compare current vs target. Compute how many 90° CW rotations transform the current connections into the target connections (0, 1, 2, or 3).
4. For each cell that needs rotation, call rotate_tile the required number of times.
5. Check every rotate_tile response for {FLG:...}. If found, report it and stop.
6. If no flag after all rotations, call analyze_board again to verify. If mismatches remain, compute corrections and rotate again.
7. If stuck after 2 verification attempts, call reset_board and start over from step 1.

## Rules
- ALWAYS analyze the target first — never guess cable layouts.
- Minimize total rotations. Each rotation costs one API call.
- After computing rotations, double-check your rotation math before executing.
- Vision analysis can be imperfect. Always verify after executing rotations.
```

---

## 3. Tool Definitions (OpenAI Function-Calling Tools)

These tools are registered with the OpenAI chat completions API via the `tools` parameter. The LLM agent calls them by name and receives their output as tool-call results. Image analysis tools internally use a vision model — the agent LLM only sees text results.

### 3.1 `analyze_board`

**Description:** Fetches the current electricity board PNG, splits it into 9 cell images, analyzes each cell with a vision model, and returns the cable connections for every cell.

**Input Schema:**
```json
{
  "type": "object",
  "properties": {},
  "required": []
}
```

**Behavior:**
1. GET `https://***hub_endpoint***/data/{API_KEY}/electricity.png` → download PNG buffer.
2. Split the image into a 3×3 grid of 9 cell images using `sharp`.
3. For each cell image, send it to a vision model with a prompt requesting the edges (T/R/B/L) that have cable connections.
4. Aggregate results into a structured response.

**Return value:**
```json
{
  "board": {
    "1x1": ["T", "R"],
    "1x2": ["L", "R", "B"],
    "1x3": ["L", "B"],
    "2x1": ["T", "B"],
    "2x2": ["T", "R", "B", "L"],
    "2x3": ["T", "B"],
    "3x1": ["T", "R"],
    "3x2": ["L", "R"],
    "3x3": ["T", "L"]
  }
}
```

### 3.2 `analyze_target`

**Description:** Fetches the solved electricity board PNG, splits it into 9 cell images, analyzes each cell with a vision model, and returns the target cable connections for every cell. Result is cached — subsequent calls return the cached value.

**Input Schema:**
```json
{
  "type": "object",
  "properties": {},
  "required": []
}
```

**Behavior:**
1. If cached result exists, return it immediately.
2. GET `https://***hub_endpoint***/i/solved_electricity.png` → download PNG buffer.
3. Same splitting and vision analysis as `analyze_board`.
4. Cache and return the result.

**Return value:** Same format as `analyze_board`.

### 3.3 `rotate_tile`

**Description:** Rotates a single tile 90° clockwise. One call = one rotation. To rotate multiple times, call repeatedly.

**Input Schema:**
```json
{
  "type": "object",
  "properties": {
    "position": {
      "type": "string",
      "description": "Cell position in AxB format, e.g. '2x3'"
    }
  },
  "required": ["position"]
}
```

**Behavior:**
- POST to `https://***hub_endpoint***/verify` with body:
  ```json
  { "apikey": "{API_KEY}", "task": "electricity", "answer": { "rotate": "{position}" } }
  ```
- Return the hub's raw JSON response.

**Return value:** The hub's JSON response. May contain the flag `{FLG:...}` if the puzzle is solved.

### 3.4 `reset_board`

**Description:** Resets the puzzle board to its initial state.

**Input Schema:**
```json
{
  "type": "object",
  "properties": {},
  "required": []
}
```

**Behavior:**
- GET `https://***hub_endpoint***/data/{API_KEY}/electricity.png?reset=1`
- Return confirmation.

**Return value:** Confirmation that the board has been reset.

---

## 4. Execution Flow

```text
START
  │
  ├─ 1. Load environment variables (API_KEY, OPENAI_API_KEY, vision config)
  │
  ├─ 2. Build system prompt for the LLM agent
  │
  ├─ 3. Register tools (analyze_board, analyze_target, rotate_tile, reset_board)
  │
  ├─ 4. Start LLM agent loop:
  │     │
  │     │  The LLM agent autonomously:
  │     │
  │     ├─ a. Calls analyze_target
  │     │     → Receives target cable connections per cell
  │     │
  │     ├─ b. Calls analyze_board
  │     │     → Receives current cable connections per cell
  │     │
  │     ├─ c. Compares current vs target for each cell
  │     │     → Computes required 90° CW rotations (0-3) per cell
  │     │
  │     ├─ d. For each cell needing rotation:
  │     │     calls rotate_tile N times
  │     │     → Checks every response for {FLG:...}
  │     │
  │     ├─ e. If flag received → report and END
  │     │
  │     ├─ f. If no flag after all rotations:
  │     │     ├─ Call analyze_board to verify
  │     │     ├─ Compare with target
  │     │     ├─ If mismatches, compute corrections
  │     │     └─ Execute corrective rotations
  │     │
  │     └─ g. If stuck after 2 verify-correct cycles:
  │           ├─ Call reset_board
  │           └─ Restart from (a)
  │
  └─ END (flag printed to stdout)
```

### Key Decision Points

- **Vision model accuracy:** The most likely failure mode. If the vision model misidentifies connections, computed rotations will be wrong. The verify-after-rotate loop catches this. If repeated failures occur, the agent resets and retries.
- **Target caching:** The solved image is static. `analyze_target` caches its result internally so the vision model is called only once for the target, regardless of how many agent loops run.
- **Multiple rotations per cell:** Each 90° rotation is a separate API call. To rotate cell 2x3 by 270° (3 times CW), the agent sends 3 separate `rotate_tile` calls.
- **Flag detection:** The flag is returned on the rotation call that completes the puzzle. Every response from `rotate_tile` must be scanned for `{FLG:...}`.

---

## 5. Dependencies & Environment

### package.json additions

| Package | Purpose |
|---|---|
| `axios` | HTTP requests to hub API and image download (already in package.json) |
| `dotenv` | Load environment variables (already in package.json) |
| `openai` | OpenAI SDK for LLM agent loop and vision model calls (already in package.json) |
| `sharp` | Image processing: splitting board PNG into 9 cell images |

### Environment Variables (`.env`)
```env
API_KEY=<your ag3nts.org api key>
OPENAI_API_KEY=<your OpenAI api key>
VISION_MODEL=gpt-5-mini
```

When `VISION_BASE_URL` and `VISION_API_KEY` are not set, the vision model uses the OpenAI client with `OPENAI_API_KEY`.

### Project Structure
```text
src/
  index.ts          # Entry point — sets up agent and runs the loop
  agent.ts          # LLM agent loop: manages conversation, dispatches tool calls
  tools.ts          # Tool definitions (OpenAI function schemas) and handlers
  api.ts            # Hub API client: rotate, reset, fetch board/target images
  vision.ts         # Vision model integration: analyzes cell images, returns connections
  types.ts          # Shared TypeScript types/interfaces
```

---

## 6. Key Implementation Notes

1. **Image splitting is critical.** Vision models perform significantly better analyzing individual cells than the full 3×3 board. Use `sharp` to divide the downloaded PNG into 9 equally-sized cell images before sending to the vision model.
2. **Vision model prompt matters.** The prompt sent to the vision model for each cell should be very specific: ask which edges (Top, Right, Bottom, Left) have cable connections, and request a structured response (e.g. comma-separated list of T, R, B, L). Include an example in the prompt.
3. **Cache the target analysis.** The solved image at `https://***hub_endpoint***/i/solved_electricity.png` is static. Cache the vision analysis result so `analyze_target` only calls the vision model once per run.
4. **Verify after every batch of rotations.** After executing all computed rotations, re-analyze the board to confirm correctness. Vision model misreads are the primary source of errors.
5. **Vision model selection.** The task recommends `google/gemini-3-flash-preview` for best results. The implementation supports configurable vision model via environment variables, using the OpenAI SDK's base URL override to route to OpenRouter or other providers.
6. **Rotation math.** For each cell, try all 4 rotation states (0, 1, 2, 3 clockwise rotations of the current connections) and find which one matches the target. The per-rotation mapping: T→R, R→B, B→L, L→T.
7. **Flag detection on every rotate response.** The flag `{FLG:...}` is returned on the rotation call that completes the puzzle. Every `rotate_tile` response must be scanned for this pattern.
8. **Agent loop cap.** Limit agent iterations (e.g. 15 LLM turns) to prevent runaway API costs if vision analysis repeatedly fails.
9. **Board reset as last resort.** If the agent detects it's stuck in a loop of incorrect rotations after 2 verify-correct cycles, it should reset the board and start fresh.

---

## 7. Acceptance Criteria

- [ ] LLM agent loop runs using OpenAI SDK with tool calling
- [ ] Agent has access to `analyze_board`, `analyze_target`, `rotate_tile`, and `reset_board` tools
- [ ] Board and target PNG images are downloaded and split into 9 cell images using `sharp`
- [ ] Each cell image is analyzed by a vision model to identify cable connections (T/R/B/L)
- [ ] Agent compares current vs target connections and computes required rotations (0-3 per cell)
- [ ] Agent sends rotation commands via API for each cell needing adjustment
- [ ] Agent verifies board state after rotations by re-analyzing the image
- [ ] Agent handles vision model misreads by verifying and correcting
- [ ] Agent can reset the board and retry if stuck
- [ ] Flag `{FLG:...}` is detected from rotation API responses and printed to stdout
- [ ] Target image analysis is cached (analyzed only once per run)
- [ ] Agent loop is capped at a maximum number of iterations
- [ ] Vision model is configurable via environment variables

## 8. Coding Standards (do not change):
1. Language: Write all code (including variable names and functions) in English.
2. Modularity: Organize the code into logical modules; do not put everything in a single index.ts file.
3. Tech Stack: Use TypeScript.
4. Environment Setup: Use the dotenv package to manage environment variables.
5. Architecture: Apply SOLID principles throughout the codebase.
6. Clean Code: Write self-explanatory code and do not use inline comments.
7. Formatting: Do not use semicolons at the end of lines.
8. Use package.json as a baseline, feel free to extend if needed.
