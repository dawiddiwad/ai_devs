# AI Agent — s03e04: Negotiations (Wind Turbine Parts Finder)

## 1. Overview & Goal

### Task Summary
Build and deploy an HTTP tool server that exposes 1 endpoint. An external agent (controlled by centrala) will call this endpoint with natural language item descriptions and use the responses to determine which cities sell all the required wind turbine components simultaneously.

After registering the tool URL, poll `/verify` with `action: "check"` to retrieve the flag once the external agent completes its work.

### Hardcoded Inputs / Initial Data
| Field | Value |
|---|---|
| Task name | `negotiations` |
| Data files | `./data/cities.csv`, `./data/connections.csv`, `./data/items.csv` |
| SSH server | `***azyl_endpoint***` port `5022`, login `***azyl_username***` |
| Verify endpoint | `***hub_endpoint***/verify` |

### Data Schema
- `cities.csv`: `name,code` — 50 cities with their codes
- `items.csv`: `name,code` — ~2136 items (Polish electronic component names) with codes
- `connections.csv`: `itemCode,cityCode` — which city sells which item (~5349 rows)

### Final Deliverable
Flag captured via regex from `/verify?action=check` response.

---

## 2. Architecture

Two processes, both in one project:

1. **`src/server.ts`** — Express HTTP server exposing the tool endpoint. Must be running on the SSH host before tool registration.
2. **`src/index.ts`** — Registers tool URLs with centrala, then polls `/verify` with `action: "check"` every 5 seconds (up to 120 seconds) until flag appears.

### Environment Variables
```env
OPENAI_API_KEY=...
AI_DEVS_API_KEY=...
HUB_ENDPOINT=https://...
SERVER_PORT=1234
PUBLIC_BASE_URL=http://your-public-url.com
```

---

## 3. Tool Design

### Single tool: `find_cities_by_item`

**Endpoint:** `POST {PUBLIC_BASE_URL}/find`

**Agent sends:**
```json
{ "params": "natural language item description" }
```

**Server responds:**
```json
{ "output": "Cities selling this item: Warszawa, Krakow, Gdansk" }
```

**Response constraints:** 4–500 bytes. Truncate city list if needed (unlikely — items are typically sold in few cities).

**Description for centrala (must be clear for external agent):**
```
Finds cities that sell a specific item. Pass a natural language description of the item in the "params" field. Returns a list of city names. Call this tool once per item you are looking for. You must intersect the city lists yourself to find cities offering all needed items simultaneously.
```

### Matching Strategy
Since item names are Polish technical component names (e.g., "Rezystor metalizowany 1 ohm 0.125 W 1%") and agent queries may be natural language ("potrzebuję rezystora 1 ohm"), use **token overlap scoring**:

1. Normalize both query and item names: lowercase, remove punctuation
2. Tokenize into words, filter stop words (potrzebuję, mam, jest, itp.)
3. Score each item: count matching tokens / total query tokens
4. Return the item with the highest score
5. If score = 0, return "No matching item found. Try different keywords."

This is deterministic, fast, and requires no LLM call on the tool server side.

---

## 4. Execution Flow

### Server startup (`src/server.ts`)
```
START
  ├─ 1. Load and parse all three CSVs into memory (Maps for O(1) lookup)
  │      cityCodeToName: Map<string, string>
  │      itemNameToCode: Array<{ name: string, code: string, tokens: string[] }>
  │      itemCodeToCities: Map<string, string[]>
  ├─ 2. Start Express on SERVER_PORT
  └─ 3. Register POST /find handler
```

### POST /find handler
```
REQUEST RECEIVED
  ├─ 1. Extract params from body
  ├─ 2. Tokenize and normalize params
  ├─ 3. Score all items by token overlap
  ├─ 4. Take best match (score > 0)
  │      IF no match → return { output: "No item found. Try rephrasing." }
  ├─ 5. Lookup itemCodeToCities for best match's code
  ├─ 6. Map city codes → city names
  ├─ 7. Build response string (trim to < 500 bytes)
  └─ 8. Return { output: "Cities selling [item name]: City1, City2, ..." }
```

### Registration & polling (`src/index.ts`)
```
START
  ├─ 1. POST /verify with tools array (register tool)
  │      { task: "negotiations", apikey, answer: { tools: [...] } }
  ├─ 2. Log registration response
  ├─ 3. Poll loop (max 24 attempts × 5s = 120s)
  │      POST /verify with { answer: { action: "check" } }
  │      Check response for FLAG_REGEX /\{FLG:.*?\}/
  │      IF flag found → log + exit(0)
  │      ELSE → wait 5s, retry
  └─ 4. If no flag after 120s → log timeout + exit(1)
```

### Tools payload sent to centrala
```json
{
  "task": "negotiations",
  "apikey": "...",
  "answer": {
    "tools": [
      {
        "URL": "{PUBLIC_BASE_URL}/find",
        "description": "Finds cities that sell a specific item. Pass a natural language description of the item in the \"params\" field. Returns a list of city names that sell the item. Call once per item. Intersect results yourself to find cities with all needed items."
      }
    ]
  }
}
```

---

## 5. Data Loading Implementation

### CSV parsing (no external lib needed — simple split)
```ts
// cities.csv → Map<code, name>
const cityCodeToName = new Map<string, string>()

// items.csv → scored search array
interface ItemEntry { name: string; code: string; tokens: Set<string> }
const items: ItemEntry[] = []

// connections.csv → Map<itemCode, cityCode[]>
const itemCodeToCities = new Map<string, string[]>()
```

### Tokenizer
```ts
function tokenize(text: string): Set<string> {
  const STOP_WORDS = new Set(['potrzebuję', 'mam', 'jest', 'the', 'a', 'i', 'do', 'w'])
  return new Set(
    text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 1 && !STOP_WORDS.has(t))
  )
}
```

### Scorer
```ts
function findBestItem(query: string): ItemEntry | null {
  const queryTokens = tokenize(query)
  let best: ItemEntry | null = null
  let bestScore = 0
  for (const item of items) {
    const overlap = [...queryTokens].filter(t => item.tokens.has(t)).length
    const score = overlap / queryTokens.size
    if (score > bestScore) { bestScore = score; best = item }
  }
  return bestScore > 0 ? best : null
}
```

---

## 6. Project Structure

```
s03e04/
├── spec.md
├── .env
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts       # Register tools + poll for flag
    ├── server.ts      # Express tool server
    ├── config.ts      # requireEnv() config
    ├── logger.ts      # Structured logging
    └── data-loader.ts # CSV parsing + search logic
```

### package.json additions
| Package | Purpose |
|---|---|
| `express` | HTTP server for tool endpoints |
| `@types/express` | TypeScript types |

---

## 7. Deployment Notes

- **Deploy target**: azyl_endpoint (SSH)
- **Run server first**: `node dist/server.js` in background on the SSH host
- **Then run index**: `node dist/index.js` locally to register + poll
- **Public URL**: must be accessible from centrala's agent — use `PUBLIC_BASE_URL` env var
- Port must not conflict with other users on the shared host — use `SERVER_PORT` from env

---

## 8. Key Gotchas
1. **Response size**: Keep output under 500 bytes. If many cities match, truncate with "... and N more".
2. **Natural language params**: Agent may send Polish natural language, not exact item names — tokenizer must handle this.
3. **Async verification**: After registering tools, the external agent takes 30–120 seconds. Poll with `action: "check"`, don't just wait once.
4. **validateStatus**: Always use `validateStatus: () => true` on axios calls to `/verify` — error responses may contain useful feedback or the flag.
5. **Server must be running** before registering tools with centrala (agent will call immediately).
6. **No LLM on server**: Keep the tool server stateless and fast — pure in-memory lookup.

---

## 9. Acceptance Criteria
- [ ] `POST /find` returns `{ output: "..." }` within 500 bytes for any item query
- [ ] Token scoring returns correct city list for known items
- [ ] Tool registered with centrala successfully
- [ ] Flag captured after polling `action: "check"`
- [ ] Server runs on SSH host and is publicly reachable
