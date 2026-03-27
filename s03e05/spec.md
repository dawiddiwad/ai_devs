# Optimal Route Planner `savethem`

## 1. Overview & Goal

### Task Summary

Build an agent that discovers available tools via a `toolsearch` API, gathers map/vehicle/movement-rules data, then uses LLM reasoning to plan an optimal route for a messenger crossing a 10×10 terrain grid. Constraints: 10 food portions + 10 fuel units. The messenger can switch vehicles mid-route (or walk). Submit the route to `/verify`.

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

### System Prompt

```markdown
You are a strategic expedition planner. Your mission: plan the optimal route
for a messenger crossing a 10×10 terrain grid to reach city Skolwin.

## Resources

- 10 fuel units and 10 food portions — do not exceed either
- Each move consumes fuel (based on vehicle speed) AND food (based on travel time)
- Faster movement burns more fuel; slower movement burns more food
- You may switch vehicles mid-route or continue on foot (foot: no fuel cost)

## Workflow

1. Discover tools via tool_search — use multiple distinct queries to find all relevant tools:
   - terrain map, vehicles, movement rules, starting position, goal location
2. Use discovered tools to collect: map layout, vehicle list + stats, terrain movement costs
3. Reason carefully: track remaining fuel and food for each possible route
4. Choose a vehicle (or sequence of vehicles), plan exact moves
5. Submit route via submit_route

## Rules

- All tool queries must be in English
- tool_search returns at most 3 results — query with varied terms to find everything
- Never assume tool endpoints — always discover them first
- Think step by step about resource consumption before committing to a route
- If a route risks running out of fuel or food, reconsider
```

---

## 3. Tool Definitions

### 3.1 `tool_search`

**Description:** Discovers available tools by natural language or keyword query.

**Input Schema:**

```json
{
	"type": "object",
	"properties": {
		"query": { "type": "string", "description": "Natural language or keyword query in English" }
	},
	"required": ["query"]
}
```

**Behavior:** POSTs `{ apikey, query }` to `***hub_url***/api/toolsearch`.

**Returns:** JSON array of up to 3 tool descriptors, each including the tool's endpoint URL and description.

---

### 3.2 `use_tool`

**Description:** Calls any discovered tool endpoint with a query.

**Input Schema:**

```json
{
	"type": "object",
	"properties": {
		"endpoint": { "type": "string", "description": "Full URL of the discovered tool" },
		"query": { "type": "string", "description": "Natural language query in English" }
	},
	"required": ["endpoint", "query"]
}
```

**Behavior:** POSTs `{ apikey, query }` to the given `endpoint`. Uses `validateStatus: () => true`.

**Returns:** Raw JSON response from the tool (string).

---

### 3.3 `submit_route`

**Description:** Submits the planned route to the verification endpoint.

**Input Schema:**

```json
{
	"type": "object",
	"properties": {
		"answer": {
			"type": "array",
			"items": { "type": "string" },
			"description": "Route array: first element is vehicle name, rest are moves (up/down/left/right)"
		}
	},
	"required": ["answer"]
}
```

**Behavior:** POSTs `{ task: "savethem", apikey, answer }` to `/verify`. Captures flag via regex `/\{FLG:.*?\}/`. Returns raw response text (error responses contain useful feedback).

**Returns:** Response text — flag if successful, error/hint otherwise. Logs flag and calls `process.exit(0)` on capture.

---

## 4. Execution Flow

```
START
  ├─ 1. tool_search("terrain map grid")
  ├─ 2. tool_search("vehicles fuel consumption speed")
  ├─ 3. tool_search("movement rules terrain cost walk")
  ├─ 4. use_tool(map endpoint, "get map")
  ├─ 5. use_tool(vehicles endpoint, "list all vehicles with stats")
  ├─ 6. use_tool(rules endpoint, "movement cost per terrain per vehicle")
  ├─ 7. [additional tool queries as needed to fill gaps]
  ├─ 8. Reason: simulate routes, track fuel+food, find optimal path
  ├─ 9. submit_route(["vehicle_name", "right", "up", ...])
  └─ END — flag captured → exit(0)
```

### Key Decision Points

- toolsearch returns max 3 results — LLM must use varied queries (`map`, `terrain`, `grid`, `navigate`, `path`) to discover all tools
- If submit fails, response text contains hints — LLM should retry with corrected route
- Vehicle switching: the answer array can include a vehicle switch by... (discover via tools what switching syntax looks like, if any)
- Max agent loop iterations: 30

---

## 5. Dependencies & Environment

### package.json additions

| Package  | Purpose                                        |
| -------- | ---------------------------------------------- |
| `openai` | LLM + tool calls                               |
| `axios`  | HTTP requests to toolsearch + discovered tools |
| `zod`    | Schema validation                              |
| `dotenv` | Env loading                                    |

### Environment Variables

```env
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-4.1          # Reasoning-capable model recommended (o4-mini also works)
AI_DEVS_API_KEY=...
AI_DEVS_TASK_NAME=savethem
AI_DEVS_HUB_ENDPOINT=...      # Base URL (no trailing slash)
```

### Project Structure

```
s03e05/
└── src/
    ├── index.ts               # Entry: calls main(), logs errors, exit(1)
    ├── agent.ts               # Agent loop (max 30 iterations)
    ├── config.ts              # requireEnv() config
    ├── logger.ts              # Structured logging: agent/tool/api × info/warn/error/debug
    ├── prompts.ts             # System prompt
    ├── types.ts               # Zod schemas + TS types
    └── tools/
        ├── tool-search.ts     # Wraps toolsearch endpoint
        ├── use-tool.ts        # Calls any discovered tool endpoint
        └── submit-route.ts    # POST /verify + flag capture
```

---

## 6. Key Implementation Notes

1. `toolsearch` and all discovered tools share the same call signature: `{ apikey, query }` → JSON
2. The `use_tool` function must forward `apikey` from config — agent only provides `endpoint` + `query`
3. `submit_route` must use `validateStatus: () => true` and always return response text (error = hint)
4. Flag regex: `/\{FLG:.*?\}/` — match in `submit_route`, log, `process.exit(0)`
5. Tool executor map pattern (not switch): `Record<string, (args: unknown) => Promise<string>>`
6. Agent loop: push each LLM message and tool result to `messages` array; break when no tool calls
7. A reasoning model (o4-mini, gpt-4.1) is strongly preferred — route optimization with resource constraints benefits from extended thinking

---

## 7. Acceptance Criteria

- [ ] Agent discovers map, vehicles, and movement rules via toolsearch
- [ ] LLM reasons about fuel/food constraints and plans a valid route
- [ ] Route submitted as `["vehicle_name", "dir", ...]` to `/verify`
- [ ] Flag captured via regex, logged, `process.exit(0)`
- [ ] Builds cleanly (`npm run build`)
- [ ] All API calls use `validateStatus: () => true`
