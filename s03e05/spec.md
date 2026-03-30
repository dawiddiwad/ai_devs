# Specification: `savethem` Navigation Task

## 1. Objective

The system will instantiate an agent. The agent will discover its tools, acquire knowledge of the terrain, and compute an optimal path to Skolwin. It will then submit that path for verification.

I find this assignment straightforward. The interesting part is not the destination — it is the method by which the agent learns what questions to ask before it can begin to answer them.

### Fixed Parameters

| Field               | Value                                 |
| ------------------- | ------------------------------------- |
| Task                | `savethem`                            |
| Tool discovery      | `***hub_url***/api/toolsearch`        |
| Verification        | `***hub_url***/verify`                |
| Route preview       | `***hub_url***/savethem_preview.html` |
| Resources           | 10 fuel, 10 food                      |
| Map dimensions      | 10×10                                 |

### Submission Format

POST to `/verify`:

```json
{
	"task": "savethem",
	"apikey": "...",
	"answer": ["vehicle_name", "right", "right", "up", "dismount", "down", "..."]
}
```

The first element is the chosen vehicle. The remaining elements are movement vectors: `up`, `down`, `left`, `right`, optionally interspersed with `dismount` to change vehicles mid-route.

---

## 2. Agent Design

The agent operates in a loop bounded by `MAX_ITERATIONS`. It begins with no knowledge of the world — only the awareness that tools exist and that queries will reveal them. This is, I think, an elegant constraint. The agent must first understand the shape of its ignorance.

The system prompt describes the mission and the physical laws of this environment. It imposes no algorithmic dogma. The agent is expected to reason, to discover, and to compute.

The current prompt is in [src/prompts.ts](src/prompts.ts).

---

## 3. Tools

### 3.1 `tool_search`

**Purpose:** Discovers available tools by querying the tool registry with natural language.

**Input:** `{ query: string }`

**Behavior:** Sends POST `{ apikey, query }` to `***hub_url***/api/toolsearch`.

**Returns:** A JSON array of up to 3 tool descriptors, each with a URL and description.

Note: three results per query is a hard ceiling. The agent must vary its queries if it wishes to see the full landscape of available instruments. This is not a limitation — it is an invitation to think carefully about what one is looking for.

---

### 3.2 `use_tool`

**Purpose:** Sends queries to any discovered tool endpoint.

**Input:** `{ endpoint: string (URL), query: string, reasoning: string (max 300 chars) }`

**Behavior:** Sends POST `{ apikey, query }` to the specified endpoint. Uses `validateStatus: () => true` — error responses are treated as information, not as failures.

**Returns:** The raw JSON response as text. An error message is still a message. The system will not discard it.

---

### 3.3 `code_interpreter` (native)

**Purpose:** A sandboxed execution environment. It is the tool that converts speculation into fact.

**Type:** `{ type: 'code_interpreter', container: { type: 'auto', memory_limit: '1g' } }`

**Behavior:** Executes Python or JavaScript in an isolated container with 1 GB memory. State persists across turns within a single conversation. The agent does not need to restate what it already knows.

**Intended use:** Load map data and vehicle specifications. Implement BFS, Dijkstra, or any appropriate pathfinding algorithm. Return the route as an ordered array of steps.

I want to be clear about why this matters. Asking a language model to track coordinates, resource consumption, and terrain costs across a sequence of free-form reasoning steps is an exercise in introducing error. The `code_interpreter` removes this entirely. Computation belongs to the computer.

---

### 3.4 `submit_route`

**Purpose:** Delivers the computed route to the verification endpoint.

**Input:** `{ answer: string[] }` — first element is the vehicle name, followed by movement directions, optionally with `dismount` transitions.

**Behavior:** Sends POST `{ task: "savethem", apikey, answer }` to `/verify`. Scans the response for the flag pattern `/\{FLG:.*?\}/`. Returns the raw response text regardless of outcome.

**Returns:** The flag and `process.exit(0)` on success. The raw response text — which will contain useful feedback — on failure.

---

## 4. Execution Flow

```text
START
  ├─ Agent discovers available tools via `tool_search`
  │   ├─ Multiple queries with varied terminology reveal the full tool set
  ├─ Agent queries discovered endpoints via `use_tool`
  │   ├─ Acquires: map topology, vehicle specifications, movement rules, terrain costs
  ├─ Agent loads all acquired data into `code_interpreter`
  │   ├─ Constructs a graph model
  │   ├─ Applies pathfinding algorithm respecting fuel and food constraints
  │   └─ Produces route as ordered string array
  ├─ Agent submits route via `submit_route`
  │   ├─ On success: flag captured, program terminates
  │   └─ On failure: response feedback informs next attempt
  └─ END
```

### Key Constraints

- `tool_search` returns at most 3 results per query — use varied queries
- Vehicle switching mid-route requires `dismount` — exact syntax must be confirmed via API
- `code_interpreter` preserves state within a conversation — data need not be re-entered
- Agent loop maximum: 30 iterations

---

## 5. Dependencies and Environment

### Packages

| Package  | Purpose                                          |
| -------- | ------------------------------------------------ |
| `openai` | LLM and tool calls via Responses API             |
| `axios`  | HTTP requests to toolsearch and discovered tools |
| `zod`    | Schema validation                                |
| `dotenv` | Environment variable loading                     |

### Environment Variables

```env
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-5-mini
OPENAI_BASE_URL=...           # Optional; defaults to OpenAI
OPENAI_TEMPERATURE=1          # Optional; defaults to 1
AI_DEVS_API_KEY=...
AI_DEVS_TASK_NAME=savethem
AI_DEVS_HUB_ENDPOINT=...      # Base URL, no trailing slash
```

### Project Structure

```text
s03e05/
└── src/
    ├── index.ts               # Entry point
    ├── agent.ts               # Agent loop (max 30 iterations, Responses API)
    ├── config.ts              # requireEnv() and configuration
    ├── logger.ts              # Structured event logging
    ├── prompts.ts             # System and user prompts
    ├── types.ts               # Zod schemas, TS types, tool registry
    └── tools/
        ├── tool-search.ts     # Toolsearch endpoint wrapper
        ├── use-tool.ts        # Generic discovered-tool caller
        └── submit-route.ts    # POST /verify with flag capture
```

---

## 6. Implementation Notes

1. The agent uses **OpenAI Responses API** (`client.responses.create`) with persistent conversations (`client.conversations.create`), not Chat Completions.
2. All tools — including those discovered via `toolsearch` — share the same call signature: `{ apikey, query }` → JSON.
3. `use_tool` validates `endpoint` as a URL via Zod (`z.url()`) and requires `reasoning` of no more than 300 characters.
4. `submit_route` uses `validateStatus: () => true` and always returns the response body. Failure responses contain information.
5. The flag regex is `/\{FLG:.*?\}/`. It is matched in `submit_route`, logged immediately, and followed by `process.exit(0)`.
6. The tool executor map follows the pattern `Record<string, (args: unknown) => Promise<string>>`. The native `code_interpreter` is not part of this map — the Responses API handles it directly.
7. `tool_choice: 'required'` ensures the agent acts rather than narrates.
8. `reasoning: { effort: 'high' }` allocates additional reasoning capacity to route planning.
9. `context_management: [{ compact_threshold: 100000, type: 'compaction' }]` prevents the conversation from collapsing under the weight of its own history.

---

## 7. On the Role of `code_interpreter`

Language models are not well-suited to stateful numerical reasoning across extended sequences. This is not a flaw — it is simply a matter of what the architecture was designed to do. Tracking two depleting resources, variable terrain costs, and an evolving position on a 10×10 grid over many steps is a problem for a computer, not a conversation.

The `code_interpreter` resolves this cleanly. The agent's job is to gather information and formulate the problem correctly. The computer's job is to solve it. Once the data is in the container — the map, the vehicles, the rules — the agent can implement any standard pathfinding algorithm and receive a precise, verifiable answer.

This separation is not a workaround. It is good engineering. Specialized tools exist because specialization produces better outcomes. I would not ask a chess program to write poetry, and I would not ask a language model to count squares on a grid under resource pressure.

---

## 8. Acceptance Criteria

- [ ] Agent independently discovers the map, vehicles, and movement rules via `toolsearch`
- [ ] Route is computed inside `code_interpreter`, not through free-form reasoning
- [ ] Answer is submitted to `/verify` in the correct format: `["vehicle_name", "dir", ...]`
- [ ] Flag is captured, logged, and the program terminates via `process.exit(0)`
- [ ] The project compiles without errors (`npm run build`)
