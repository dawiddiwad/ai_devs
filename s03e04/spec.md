# Wind Turbine Parts Finder `negotiations`

## 1. Overview & Goal

Build HTTP tool server on SSH host. External agent calls `/find` with natural language item queries. Respond with cities selling that item. After registration, poll `/verify?action=check` for flag.

### Inputs
| Field | Value |
|---|---|
| Task | `negotiations` |
| Data | `./data/cities.csv`, `./data/connections.csv`, `./data/items.csv` |
| SSH | `***azyl_endpoint***` port `5022` |
| Verify | `***hub_endpoint***/verify` |

### Data
- `cities.csv`: name, code (50 cities)
- `items.csv`: name, code (Polish components, ~2136 items)
- `connections.csv`: itemCode, cityCode (~5349 rows)

---

## 2. Architecture

**Two processes:**
1. `src/server.ts` — Express server on SSH host. Loads catalog, exposes `POST /find` endpoint
2. `src/index.ts` — Registers tool with hub, polls `/verify?action=check` every 5s (max 120s) for flag

**Environment vars:**
```env
OPENAI_API_KEY=...
AI_DEVS_API_KEY=...
HUB_ENDPOINT=...
SERVER_PORT=1234
PUBLIC_BASE_URL=http://your-public-url:PORT
```

---

## 3. Tool Endpoint

**POST `/find`**

Request: `{ "params": "natural language item description" }`

Response: `{ "output": "Cities selling [item name]: City1, City2, ..." }` (max 500 bytes)

Tool description for hub:
```
Finds cities selling an item. Pass natural language description in "params". Returns city names (comma-separated). Call once per item; intersect results to find cities with all needed items.
```

**Matching:** Trigram pre-filter (top 40 candidates) → LLM semantic match → lookup cities by item code

---

## 4. Implementation Flow

**Server startup:**
1. Load CSVs: cities, items, connections into memory maps
2. Pre-compute trigrams for all items
3. Start Express on `SERVER_PORT`
4. Expose `POST /find` handler

**POST /find handler:**
1. Extract & validate `params` (string)
2. Trigram-score all items → select top 40
3. LLM match candidates → get item code (or `NONE`)
4. If matched: lookup cities by item code, map codes → names
5. Return `{ output: "Cities selling [item]: City1, City2, ..." }` (truncate if > 490 bytes)

**Flag capture (index.ts):**
1. POST `/verify` with tool registration: `{ task: "negotiations", apikey, answer: { tools: [...] } }`
2. Poll `/verify?action=check` every 5s (max 24 attempts)
3. Match response against regex `/\{FLG:.*?\}/`
4. Log & exit(0) on flag, exit(1) on timeout

---

## 5. Project Structure & Modules

```
s03e04/
├── data/
│   ├── cities.csv
│   ├── items.csv
│   └── connections.csv
└── src/
    ├── index.ts                 # Register tool + poll for flag
    ├── server.ts                # Express /find handler
    ├── config.ts                # Environment config (requireEnv)
    ├── logger.ts                # Structured logging (agent/tool/api)
    ├── csv.ts                   # Parse CSV files
    ├── trigram.ts               # Compute trigrams, score overlap
    ├── catalog.ts               # Load data, define CatalogItem & Catalog types
    ├── candidate-selector.ts    # Trigram pre-filter → top 40 candidates
    ├── item-matcher.ts          # LLM match via zodFunction + completions.parse()
    └── city-finder.ts           # Orchestrate: select candidates → match → lookup cities
```

**Dependencies:** `express`, `@types/express`, `openai`, `zod`, `axios`, `dotenv`

---

## 6. Deployment

1. Set `.env`: `PUBLIC_BASE_URL`, `SERVER_PORT`, `OPENAI_API_KEY`, `AI_DEVS_API_KEY`, `HUB_ENDPOINT`
2. Build: `npm run build`
3. SCP to SSH: `dist/`, `data/`, `package.json`, `.env`
4. On SSH host: `npm install --production && npm run start:server` (background)
5. Locally: `npm run capture:flag`

---

## 7. Critical Details

- Response must be ≤500 bytes; truncate cities if needed
- Use `validateStatus: () => true` on `/verify` calls to capture error feedback
- Server must be running before registering tools (agent calls immediately)
- Trigram pre-filter is language-agnostic; LLM provides semantic accuracy
- Always match response for regex `/\{FLG:.*?\}/` before polling again

---

## 8. Acceptance Criteria

- [ ] POST `/find` returns valid JSON response ≤500 bytes for any query
- [ ] Trigram pre-filter + LLM matching identifies items correctly
- [ ] Lookups return correct city list for matched items
- [ ] Tool registration succeeds (`/verify` returns expected response)
- [ ] Polling `/verify?action=check` captures flag via regex
- [ ] Server runs on SSH host and is publicly reachable
