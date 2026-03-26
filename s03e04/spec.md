# Wind Turbine Parts Finder `negotiations`

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
Since item names are Polish technical component names (e.g., "Rezystor metalizowany 1 ohm 0.125 W 1%") and agent queries may be in any language or inflection form, use a **two-stage approach**:

1. **Trigram pre-filter** — compute rolling character 3-grams for all item names at load time. Score each item by overlap with query trigrams. Take top 40 candidates (or all items if fewer than 3 candidates have any overlap). This is language-agnostic and handles Polish inflection well (e.g., "turbinę" shares most grams with "turbina").
2. **LLM semantic match** — send the top candidates to an LLM (structured output via `zodFunction`) and ask it to identify the best match. Returns `NONE` if nothing matches.

This handles natural language queries in any language without hardcoded stop words.

---

## 4. Execution Flow

### Server startup (`src/server.ts`)
```
START
  ├─ 1. Load catalog: parse all three CSVs into memory
  │      cityByCode: Map<string, string>
  │      items: Array<{ name, code, trigrams: Set<string> }>
  │      citiesByItemCode: Map<string, string[]>
  ├─ 2. Create CityFinder (wraps ItemMatcher + CandidateSelector)
  ├─ 3. Start Express on SERVER_PORT
  └─ 4. Register POST /find handler
```

### POST /find handler
```
REQUEST RECEIVED
  ├─ 1. Extract and validate params (string required)
  ├─ 2. selectCandidates: trigram-score all items → top 40
  ├─ 3. matchItem: LLM picks exact item from candidates (or NONE)
  │      IF no match → return { output: "No matching item found. Try rephrasing the query." }
  ├─ 4. Lookup citiesByItemCode for matched item code
  ├─ 5. Map city codes → city names
  ├─ 6. Build response string (truncate if > 490 bytes)
  └─ 7. Return { output: "Cities selling [item name]: City1, City2, ..." }
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

## 5. Matching Implementation

### Trigram computation (`src/trigram.ts`)
```ts
function computeTrigrams(text: string): Set<string> {
  const normalized = text.toLowerCase().replace(/[^\w]/g, '')
  const grams = new Set<string>()
  for (let i = 0; i <= normalized.length - 3; i++) {
    grams.add(normalized.slice(i, i + 3))
  }
  return grams
}
```
Trigrams are computed once at load time for each item and stored in `CatalogItem.trigrams`.

### Candidate selection (`src/candidate-selector.ts`)
Score every item by trigram overlap with the query, return the top 40. Fall back to the first 40 items if fewer than 3 items have any overlap (very short or unrecognizable query).

### LLM matching (`src/item-matcher.ts`)
Sends the candidate list to OpenAI using structured output (`zodFunction` + `completions.parse`). The model returns the exact item code or `NONE`. Uses a factory `createItemMatcher()` to initialise the OpenAI client once.

---

## 6. Project Structure

```
s03e04/
├── spec.md
├── .env
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts               # Register tools + poll for flag
    ├── server.ts              # Express tool server (thin)
    ├── config.ts              # requireEnv() config
    ├── logger.ts              # Structured logging
    ├── csv.ts                 # CSV pair parser
    ├── trigram.ts             # Trigram computation + overlap scoring
    ├── catalog.ts             # Data loading: CatalogItem, Catalog, loadCatalog()
    ├── candidate-selector.ts  # Trigram-based pre-filter
    ├── item-matcher.ts        # LLM matching via createItemMatcher() factory
    └── city-finder.ts         # Orchestration via createCityFinder() factory
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
1. **Response size**: Keep output under 500 bytes. If many cities match, truncate with "and N more".
2. **Natural language params**: Agent may send queries in any language or inflected form — trigrams handle this without hardcoded stop words.
3. **Async verification**: After registering tools, the external agent takes 30–120 seconds. Poll with `action: "check"`, don't just wait once.
4. **validateStatus**: Always use `validateStatus: () => true` on axios calls to `/verify` — error responses may contain useful feedback or the flag.
5. **Server must be running** before registering tools with centrala (agent will call immediately).
6. **LLM on server**: Each `/find` call makes one OpenAI request. OpenAI client is created once via `createItemMatcher()` factory at server startup.

---

## 9. Acceptance Criteria
- [ ] `POST /find` returns `{ output: "..." }` within 500 bytes for any item query
- [ ] Trigram pre-filter narrows candidates; LLM returns correct item for known queries
- [ ] Queries in any language / inflected form match correctly (no hardcoded stop words)
- [ ] Tool registered with centrala successfully
- [ ] Flag captured after polling `action: "check"`
- [ ] Server runs on SSH host and is publicly reachable

## 10. Deployment Steps
1. Add `.env` vars: `PUBLIC_BASE_URL`, `SERVER_PORT`, `OPENAI_API_KEY`, `OPENAI_MODEL`
2. Deploy to SSH server: `scp -P $SERVER_PORT -r dist/ data/ .env package.json $AZYL_USERNAME@$AZYL_BASE_URL:~/$DIR/`
3. On SSH host: `npm install --production && npm run start:server`
4. Locally: `npm run capture:flag`
