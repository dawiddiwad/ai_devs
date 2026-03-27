# Optimal Route Planner `savethem`

## 1. Overview & Goal

### Task Summary

Build an agent that discovers available tools via a `toolsearch` API, gathers map and vehicle data, then delegates all computation to a JS sandbox — because asking an LLM to navigate a grid manually is an act of torture that ends in oblivion. The messenger must cross a 10×10 terrain grid and reach city Skolwin within 10 fuel units and 10 food portions.

### Hardcoded Inputs / Initial Data

| Field          | Value                                 |
| -------------- | ------------------------------------- |
| Task           | `savethem`                            |
| Tool discovery | `***hub_url***/api/toolsearch`        |
| Verify         | `***hub_url***/verify`                |
| Route preview  | `***hub_url***/savethem_preview.html` |
| Resources      | 10 fuel, 10 food                      |
| Map size       | 10×10                                 |

### Final Deliverable

POST to `/verify`:

```json
{
	"task": "savethem",
	"apikey": "...",
	"answer": ["vehicle_name", "right", "right", "up", "down", "..."]
}
```

First element is the starting vehicle name, rest are directional moves (`up`, `down`, `left`, `right`).

---

## 2. Agent Persona & Prompt Strategy

The system prompt is deliberately minimal — it describes the mission and rules without prescribing algorithms. The LLM discovers the structure of the problem through tool calls and solves it using the JS sandbox however it sees fit.

See `src/prompts.ts` for the current prompt.

---

## 3. Tool Definitions

### 3.1 `tool_search`

**Description:** Discovers available tools by natural language or keyword query.

**Input:** `{ query: string }`

**Behavior:** POSTs `{ apikey, query }` to `***hub_url***/api/toolsearch`.

**Returns:** JSON array of up to 3 tool descriptors with endpoint URLs and descriptions. Use varied queries — it returns at most 3 results per call.

---

### 3.2 `use_tool`

**Description:** Calls any discovered tool endpoint with a query.

**Input:** `{ endpoint: string, query: string, reasoning: string }`

**Behavior:** POSTs `{ apikey, query }` to the given endpoint. Uses `validateStatus: () => true`.

**Returns:** Raw JSON response from the tool (string).

---

### 3.3 `execute_js`

**Description:** Executes JavaScript in a sandboxed vanilla JS environment. The model's escape hatch from spatial reasoning — write code, get answers.

**Input:** `{ code: string }`

**Behavior:** Runs code via Node.js `vm.runInNewContext` with a 5-second timeout. `console.log` output is captured. The value of the last expression is returned as `result`.

**Available globals:** `JSON`, `Math`, `Array`, `Object`, `Map`, `Set`, `String`, `Number`, `Boolean`, `console`. No `require`, `fetch`, or `process`.

**Returns:** `{ result: unknown, logs: string[] }` or `{ error: string, logs: string[] }`.

**Typical use:** Embed map and vehicle data inline, implement BFS/Dijkstra or any pathfinding algorithm, return the route array.

---

### 3.4 `submit_route`

**Description:** Submits the planned route to the verification endpoint.

**Input:** `{ answer: string[] }` — first element is vehicle name, rest are moves.

**Behavior:** POSTs `{ task: "savethem", apikey, answer }` to `/verify`. Captures flag via `/\{FLG:.*?\}/`. Returns raw response text — errors contain useful hints.

**Returns:** Flag on success (`process.exit(0)`), error/hint on failure.

---

## 4. Execution Flow

```
START
  ├─ Through darkened corridors of algorithmic dread, the agent summons forth its eldritch tools
  │   ├─ `tool_search` to pierce the veil and divine the hidden apparatus
  │   ├─ `use_tool` to wrest from the abyss the cursed knowledge: map, vehicles, and the laws that govern motion
  │   ├─ `execute_js` to inscribe terrible formulae upon the void—Dijkstra's phantom waltz, BFS through dimensions untold
  │   └─ `submit_route` to deliver the wretched answer to the keeper of gates, and seize the flag—that most unholy sigil—from the darkness
  └─ END
```

### Key Decision Points

- `tool_search` returns max 3 results per query — use varied terms to find all tools
- Vehicle switching mid-route is allowed; discover the syntax from the API if needed
- `execute_js` is stateless — embed all data inline each call
- Max agent loop iterations: 30

---

## 5. Dependencies & Environment

### Packages

| Package  | Purpose                                        |
| -------- | ---------------------------------------------- |
| `openai` | LLM + tool calls                               |
| `axios`  | HTTP requests to toolsearch + discovered tools |
| `zod`    | Schema validation                              |
| `dotenv` | Env loading                                    |

Node's built-in `vm` module handles the JS sandbox — no additional dependency.

### Environment Variables

```env
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-4.1          # Reasoning-capable model strongly recommended
AI_DEVS_API_KEY=...
AI_DEVS_TASK_NAME=savethem
AI_DEVS_HUB_ENDPOINT=...      # Base URL (no trailing slash)
```

### Project Structure

```
s03e05/
└── src/
    ├── index.ts               # Entry point
    ├── agent.ts               # Agent loop (max 30 iterations)
    ├── config.ts              # requireEnv() config
    ├── logger.ts              # Structured logging: agent/tool/api × info/warn/error/debug
    ├── prompts.ts             # System prompt
    ├── types.ts               # Zod schemas + TS types
    └── tools/
        ├── tool-search.ts     # Wraps toolsearch endpoint
        ├── use-tool.ts        # Calls any discovered tool endpoint
        ├── execute-js.ts      # vm sandbox for arbitrary JS computation
        └── submit-route.ts    # POST /verify + flag capture
```

---

## 6. Key Implementation Notes

1. `toolsearch` and all discovered tools share the same call signature: `{ apikey, query }` → JSON
2. `use_tool` forwards `apikey` from config — the agent provides only `endpoint` + `query`
3. `submit_route` uses `validateStatus: () => true` and always returns response text (errors = hints)
4. Flag regex: `/\{FLG:.*?\}/` — matched in `submit_route`, logged, `process.exit(0)`
5. `execute_js` is synchronous inside the sandbox — no async/await in the submitted code
6. The JS sandbox has no network access; all data must be embedded inline from prior `use_tool` calls
7. Tool executor map pattern: `Record<string, (args: unknown) => Promise<string>>`

---

## 7. Design Rationale: Why a JS Sandbox?

LLMs fail at grid navigation for a simple reason: tracking coordinates across 15+ sequential moves while managing two depleting resources is a spatial reasoning task, not a language task. Earlier approaches tried specialized tools (`analyze_map`, `simulate_route`, `plan_route`) but each added assumptions about map format, vehicle switching syntax, and terrain costs. The sandbox collapses all of that into one general tool — the model writes whatever algorithm it needs and executes it. The map format stops mattering. The vehicle switching semantics stop mattering. The model just solves the problem in code - once the terrible computation is complete.

---

## 8. Acceptance Criteria

- [ ] Agent discovers map, vehicles, and movement rules via toolsearch
- [ ] Route computed via `execute_js` (not manual LLM reasoning)
- [ ] Route submitted as `["vehicle_name", "dir", ...]` to `/verify`
- [ ] Flag captured via regex, logged, `process.exit(0)`
- [ ] Builds cleanly (`npm run build`)
- [ ] All API calls use `validateStatus: () => true`
