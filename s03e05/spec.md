# Optimal Route Planner `savethem`

## 1. Overview & Goal

The messenger must cross a 10×10 terrain grid and reach city Skolwin within 10 fuel units and 10 food portions. Build an agent that discovers available tools via API, gathers map, vehicle and obstacle data, then submits route plans.

Asking an LLM to navigate a grid manually is an act of torture that ends in oblivion... The solution is to give the LLM a proper sandboxed environment where it can write and execute code — escaping spatial reasoning entirely. The result is a resilient agent that can handle unexpected tool responses, varied map formats, and complex pathfinding logic.

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
	"answer": ["vehicle_name", "right", "right", "up", "dismount", "down", "..."]
}
```

First element is the starting vehicle name, rest are directional moves (`up`, `down`, `left`, `right`). Use `dismount` to switch to walking at any point in the route.

---

## 2. Agent Persona & Prompt Strategy

The system prompt is deliberately minimal — it describes the mission and rules without prescribing algorithms. The LLM discovers the structure of the problem through tool calls and solves it using `code_interpreter` however it sees fit.

See [src/prompts.ts](src/prompts.ts) for the current prompt.

---

## 3. Tool Definitions

### 3.1 `tool_search`

**Description:** Discovers available tools by natural language or keyword query.

**Input:** `{ query: string }`

**Behavior:** POSTs `{ apikey, query }` to `***hub_url***/api/toolsearch`.

**Returns:** JSON array of up to 3 tool descriptors with endpoint URLs and descriptions. Use varied queries — it returns at most 3 results per call.

---

### 3.2 `use_tool`

**Description:** Calls any discovered tool endpoint with a natural language query.

**Input:** `{ endpoint: string (URL), query: string, reasoning: string (max 300 chars) }`

**Behavior:** POSTs `{ apikey, query }` to the given endpoint. Uses `validateStatus: () => true`.

**Returns:** Raw JSON response from the tool (string). Error responses contain useful hints.

---

### 3.3 `code_interpreter` (built-in)

**Description:** OpenAI's built-in code execution environment — the model's escape hatch from spatial reasoning. Write code, get answers.

**Type:** `{ type: 'code_interpreter', container: { type: 'auto', memory_limit: '1g' } }`

**Behavior:** The model writes and executes arbitrary Python/JS in a sandboxed container with 1 GB memory. This environment supports async code, imports, and stateful execution within a conversation.

**Typical use:** Embed map and vehicle data inline, implement BFS/Dijkstra or any pathfinding algorithm, return the route array.

---

### 3.4 `submit_route`

**Description:** Submits the planned route to the verification endpoint.

**Input:** `{ answer: string[] }` — first element is vehicle name, rest are moves (including optional `dismount`).

**Behavior:** POSTs `{ task: "savethem", apikey, answer }` to `/verify`. Captures flag via `/\{FLG:.*?\}/`. Returns raw response text — errors contain useful hints.

**Returns:** Flag on success (`process.exit(0)`), error/hint on failure.

---

## 4. Execution Flow

```
START
  ├─ Through darkened corridors of algorithmic dread, the agent summons forth its eldritch tools
  │   ├─ `tool_search` to pierce the veil and divine the hidden apparatus
  │   ├─ `use_tool` to wrest from the abyss the cursed knowledge: map, vehicles, and the laws that govern motion
  │   ├─ `code_interpreter` to inscribe terrible formulae upon the void—Dijkstra's phantom waltz, BFS through dimensions untold
  │   └─ `submit_route` to deliver the wretched answer to the keeper of gates, and seize the flag—that most unholy sigil—from the darkness
  └─ END
```

### Key Decision Points

- `tool_search` returns max 3 results per query — use varied terms to find all tools
- Vehicle switching mid-route: use `dismount` to switch to walking; discover full syntax via API
- `code_interpreter` is stateful within a conversation — data embedded once can be reused across calls
- Max agent loop iterations: 30

---

## 5. Dependencies & Environment

### Packages

| Package  | Purpose                                        |
| -------- | ---------------------------------------------- |
| `openai` | LLM + tool calls via Responses API             |
| `axios`  | HTTP requests to toolsearch + discovered tools |
| `zod`    | Schema validation                              |
| `dotenv` | Env loading                                    |

### Environment Variables

```env
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-5-mini       # Reasoning-capable model
OPENAI_BASE_URL=...           # Optional; defaults to OpenAI
OPENAI_TEMPERATURE=1          # Optional; default 1
AI_DEVS_API_KEY=...
AI_DEVS_TASK_NAME=savethem
AI_DEVS_HUB_ENDPOINT=...      # Base URL (no trailing slash)
```

### Project Structure

```
s03e05/
└── src/
    ├── index.ts               # Entry point
    ├── agent.ts               # Agent loop (max 30 iterations, Responses API)
    ├── config.ts              # requireEnv() config
    ├── logger.ts              # Structured logging: agent/tool/api × info/warn/error/debug
    ├── prompts.ts             # System + user prompts
    ├── types.ts               # Zod schemas + TS types + tool registry
    └── tools/
        ├── tool-search.ts     # Wraps toolsearch endpoint
        ├── use-tool.ts        # Calls any discovered tool endpoint
        └── submit-route.ts    # POST /verify + flag capture
```

---

## 6. Key Implementation Notes

1. Agent uses **OpenAI Responses API** (`client.responses.create`) with persistent conversations (`client.conversations.create`), not the Chat Completions API.
2. `toolsearch` and all discovered tools share the same call signature: `{ apikey, query }` → JSON.
3. `use_tool` validates `endpoint` as a URL (Zod `z.url()`) and requires `reasoning` (max 300 chars).
4. `submit_route` uses `validateStatus: () => true` and always returns response text (errors = hints).
5. Flag regex: `/\{FLG:.*?\}/` — matched in `submit_route`, logged, `process.exit(0)`.
6. Tool executor map pattern: `Record<string, (args: unknown) => Promise<string>>`. Built-in `code_interpreter` is NOT in the executor map — it's handled natively by the Responses API.
7. `tool_choice: 'required'` ensures the model always calls a tool, preventing premature text responses.
8. `reasoning: { effort: 'high' }` enables extended reasoning for better pathfinding decisions.
9. `context_management: [{ compact_threshold: 100000, type: 'compaction' }]` keeps long conversations within context limits.

---

## 7. Design Rationale: Why `code_interpreter` instead of Tools?

LLMs fail at grid navigation for a simple reason: tracking coordinates across 15+ sequential moves while managing two depleting resources is a spatial reasoning task, not a language task. Earlier approaches tried specialized tools (`analyze_map`, `simulate_route`, `plan_route`) but each added assumptions about map format, vehicle switching syntax, and terrain costs.

The current approach uses OpenAI's built-in `code_interpreter`: a sandboxed container with memory and statefulness across calls. The model orchestrates tools for problem discovery, then solves pathfinding in code — escaping spatial reasoning entirely. This approach is robust: map format and vehicle syntax become details the model handles, not constraints we prescribe. The result is a resilient agent that works even on lower-tier models like `gpt-5-mini`.

---

## 8. Acceptance Criteria

- [ ] Agent discovers map, vehicles, and movement rules via toolsearch
- [ ] Agent uses `code_interpreter` to compute an optimal route based on discovered data
- [ ] Route submitted as `["vehicle_name", "dir", ...]` to `/verify`
- [ ] Flag captured via regex, logged, `process.exit(0)`
- [ ] Builds cleanly (`npm run build`)
- [ ] All API calls use `validateStatus: () => true`
