# Agent `domatowo`

## 1. Overview & Goal

### Task Summary

Misja ratunkowa w zbombardowanym Domatowie. Na podstawie przechwyconego sygnału radiowego wiadomo, że partyzant ukrywa się w jednym z **najwyższych bloków** na mapie 11×11. Agent musi: zbadać mapę terenu, zaplanować optymalną trasę transporterów i zwiadowców, przeprowadzić inspekcje budynków (najwyższe pierwsze), odnaleźć człowieka i wezwać helikopter — wszystko w limicie 300 punktów akcji.

### Hardcoded Inputs / Initial Data

| Field | Value |
|---|---|
| Task name | `domatowo` |
| Verify endpoint | `config.verifyEndpoint` (`HUB_ENDPOINT + /verify`) |
| API key | `config.aiDevsApiKey` |
| Starting action | `help` → autonomously discover all actions |

### Final Deliverable

Flaga `/\{FLG:.*?\}/` w odpowiedzi na `callHelicopter` z poprawnymi współrzędnymi. Zalogowana, `process.exit(0)`.

---

## 2. Agent Persona & Prompt Strategy

### System Prompt

```markdown
You are a tactical mission commander coordinating a rescue operation in the destroyed
city of Domatowo (11×11 grid map).

## Intelligence

Intercepted radio signal: "I'm alive. Bombs destroyed the city. Soldiers were here,
took fuel. It's empty now. I have a weapon, I'm wounded. I hid in one of the
tallest buildings. No food. Help."

Key deduction: the partisan is in one of the TALLEST BUILDINGS on the map.

## Resources (hard limits)
- 300 action points total
- Max 4 transporters, max 8 scouts

## Action Point Costs
- Create scout: 5 pts
- Create transporter: 5 pts base + 5 pts per passenger
- Move scout: 7 pts per field
- Move transporter: 1 pt per field (streets only)
- Inspect field: 1 pt
- Drop scouts from transporter: 0 pts

## Workflow
1. call_api("help") — learn all available actions and parameters
2. call_api("getMap") — get raw 11×11 grid data
3. code_interpreter — analyze map: find terrain types, rank buildings by height,
   compute BFS routes for transporters (streets only), calculate exact point budget,
   output ordered action plan (tallest buildings first)
4. Execute plan: create units → move transporters → drop scouts → inspect
5. call_api("getLogs") after each inspect batch — check for partisan
6. When partisan confirmed: call_api("callHelicopter", { destination: "XN" }) immediately

## Rules
- Inspect tallest buildings first — this is the critical constraint
- Never exceed 300 action points — track budget exactly
- Use transporters for bulk movement (1 pt/field vs 7 pt/field for scouts)
- Drop scouts near tall-building clusters, then inspect on foot
- Call getLogs after every inspect to detect find immediately
```

---

## 3. Tool Definitions

### 3.1 `call_api`

**Description:** Execute any domatowo API action. Handles both sync and async responses.

**Input Schema:**

```json
{
  "type": "object",
  "properties": {
    "action": {
      "type": "string",
      "description": "API action name, e.g. help, getMap, create, move, inspect, getLogs, callHelicopter"
    },
    "params": {
      "type": "string",
      "nullable": true,
      "description": "JSON-encoded params, e.g. {\"type\":\"transporter\",\"passengers\":2} or null"
    }
  },
  "required": ["action"]
}
```

**Behavior:**
- POST `{ apikey, task: "domatowo", answer: { action, ...parsedParams } }` to `config.verifyEndpoint`
- `validateStatus: () => true` — never throw, all responses contain useful info
- Check raw response text for `/\{FLG:.*?\}/` — if match: log flag, `process.exit(0)`
- Return full response as string

**Returns:** Raw API response string (JSON or plain text)

### 3.2 `code_interpreter` (native OpenAI tool)

No custom implementation needed — registered as `{ type: "code_interpreter", container: { type: "auto" } }` in `toolDefinitions`. The Responses API handles it natively. The agent loop must handle `code_interpreter_call` items in response output (log them, no manual dispatch needed — the API executes them automatically and includes output in the conversation).

---

## 4. Execution Flow

```
START
  ├─ 1. call_api("help")
  │     → discover actions: getMap, create, move, inspect, getLogs, callHelicopter
  ├─ 2. call_api("getMap")
  │     → 11×11 grid JSON (terrain types, building heights, street layout)
  ├─ 3. code_interpreter
  │     → parse grid, visualize as ASCII
  │     → identify: streets (transporter paths), buildings (with heights)
  │     → rank buildings by height descending
  │     → BFS: shortest street path from spawn to tall-building zones
  │     → calculate exact point cost for each deployment option
  │     → output: concrete action sequence with running point totals
  ├─ 4. Execute deployment plan
  │     ├─ call_api("create", '{"type":"transporter","passengers":N}')
  │     ├─ call_api("move", '{"unitId":"T1","direction":"N"}')  ← repeat
  │     ├─ [transporter reaches tall-building zone]
  │     ├─ call_api("move", '{"unitId":"T1","direction":"drop"}')  ← or equivalent
  │     └─ scouts inspect on foot from drop zone
  ├─ 5. Inspect + verify loop
  │     ├─ call_api("inspect", '{"position":"A7"}')  ← tallest first
  │     ├─ call_api("getLogs")
  │     ├─ [if not found] → next tallest building
  │     └─ [if found] → step 6
  ├─ 6. call_api("callHelicopter", '{"destination":"A7"}')
  │     → check response for /\{FLG:.*?\}/
  │     → log flag → process.exit(0)
  └─ DONE
```

### Key Decision Points

- If `help` reveals different action names → agent adapts (no hardcoded names in prompts beyond the few given in task.md)
- If budget runs tight → re-run code_interpreter with remaining points, replan
- If partisan not in first batch of tall buildings → inspect next tier by height
- Agent loop handles `code_interpreter_call` output transparently (no special dispatch)

---

## 5. Dependencies & Environment

### package.json additions

None — existing deps sufficient (`openai`, `axios`, `zod`, `dotenv`).

### Environment Variables

```env
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o
AI_DEVS_API_KEY=
AI_DEVS_HUB_ENDPOINT=***hub_endpoint***
AI_DEVS_TASK_NAME=domatowo
```

### Project Structure

```
src/
  index.ts          — thin entry: runAgent()
  agent.ts          — loop MAX_ITERATIONS=20, handles function_call + code_interpreter_call
  config.ts         — requireEnv(), verifyEndpoint = hubEndpoint + "/verify"
  logger.ts         — unchanged from template
  prompts.ts        — SYSTEM_PROMPT
  types.ts          — toolDefinitions: [callApiTool.definition, { type: "code_interpreter" }]
  tool-factory.ts   — already present, reuse
  tools/
    call-api.ts     — unified API wrapper with flag capture
```

---

## 6. Key Implementation Notes

1. **code_interpreter_call handling** — copy pattern from `s03e05/src/agent.ts`: when `item.type === 'code_interpreter_call'`, log it but do NOT push a function_call_output — the Responses API handles CI natively and the output is already in the conversation.

2. **Flag capture is ONLY in `call-api.ts`** — after every response, check raw text with `/\{FLG:.*?\}/`. This covers both `callHelicopter` and any unexpected early success.

3. **params as nullable JSON string** — matches s04e02 pattern. Agent passes `null` for actions with no params (help, getMap, getLogs).

4. **tool_choice: 'auto'** not `'required'` — unlike s03e05, the agent may need to reason between steps without calling a tool (e.g., after reading getLogs output before deciding next inspect target).

5. **verifyEndpoint** — `config.hubEndpoint + "/verify"` — do NOT hardcode the URL in source.

6. **Budget awareness in prompt** — include exact costs in system prompt so the agent can verify code_interpreter calculations against its own reasoning.

---

## 7. Acceptance Criteria

- [ ] `npm run dev` completes without manual intervention
- [ ] Agent calls `help` before any other action
- [ ] Agent calls `getMap` and passes result to `code_interpreter`
- [ ] `code_interpreter` outputs deployment plan with point totals ≤ 300
- [ ] Tallest buildings inspected before shorter ones
- [ ] `getLogs` called after every `inspect` batch
- [ ] Flag captured via regex in `call-api.ts`, never by LLM
- [ ] `process.exit(0)` immediately on flag capture
- [ ] `npm run compile:check` passes clean
