# Agent `okoeditor`

## 1. Overview & Goal

### Task Summary

Agent edits records in the OKO operational monitoring system to erase evidence of a resistance mission near Skolwin. It browses the OKO API (read-only) to discover data IDs, then uses the Centrala `/verify` API as the sole write path to execute four mutations.

### Hardcoded Inputs / Initial Data

| Field | Value |
| ----- | ----- |
| OKO URL | `config.okoUrl` (from env) |
| OKO credentials | `config.okoLogin` / `config.okoPassword` (from env) |
| Centrala verify URL | `config.verifyEndpoint` |
| Task name | `okoeditor` |

### Final Deliverable

Flag matching `/\{FLG:.*?\}/` extracted from Centrala `done` response. Logged and `process.exit(0)`.

---

## 2. Agent Persona & Prompt Strategy

Credentials are injected at runtime from `config` — never hardcoded in source.

### System Prompt

```markdown
You are a covert data editor for the resistance.

## Mission
Complete exactly four tasks to alter OKO monitoring records:
1. Change Skolwin city report classification: vehicles/people → animals
2. Find the Skolwin task → mark it done, note animals (e.g. beavers) observed
3. Create new incident: human movement detected near city Komarowo
4. Call action "done" via Centrala when finished

## Systems
- OKO API (${config.okoUrl}) — browse to find report/task IDs.
  Login: ${config.okoLogin} / ${config.okoPassword}
- Centrala /verify — the ONLY write path. Use the `centrala` tool.
- Do NOT use `http_request` for writes. Do NOT use `centrala` for OKO browsing.

## Workflow
1. Call `centrala` with action "help" to discover all available actions and parameters
2. Use `http_request` to login to OKO and browse for relevant IDs
3. Execute the four mutations via `centrala` in order
4. When `centrala` returns a flag, mission is complete

## Rules
- Discover before you act — call help first
- Read error responses from centrala carefully and retry with corrected params
- Do not fabricate IDs — get them from OKO
```

User prompt: `"Execute all four missions in sequence."`

---

## 3. Tool Definitions

### 3.1 `http_request`

**Description:** HTTP tool for OKO API interaction only. Manages session cookies via internal cookie jar. Do NOT use for Centrala writes.

**Input Schema:**

```json
{
  "type": "object",
  "properties": {
    "url": { "type": "string", "description": "Full URL" },
    "method": { "type": "string", "enum": ["GET", "POST"], "description": "HTTP method" },
    "body": { "type": "object", "description": "JSON body for POST" },
    "headers": { "type": "object", "description": "Extra request headers" },
    "bodyEncoding": { "type": "string", "enum": ["json", "form"], "description": "Body encoding, default json" }
  },
  "required": ["url", "method"]
}
```

**Behavior:**
- Module-level singleton `CookieJar` + wrapped axios client (`axios-cookiejar-support` + `tough-cookie`)
- `validateStatus: () => true` — never throws
- `bodyEncoding: "form"` → `URLSearchParams` + `Content-Type: application/x-www-form-urlencoded`

**Returns:** `JSON.stringify({ status, body })` — body is parsed JSON or raw string

---

### 3.2 `centrala`

**Description:** Submits an action to the Centrala `/verify` endpoint. Wraps the standard payload format automatically. Use for all Centrala interactions: `help`, mutations, `done`.

**Input Schema:**

```json
{
  "type": "object",
  "properties": {
    "action": { "type": "string", "description": "Action name (e.g. help, done, edit_report)" },
    "params": { "type": "object", "description": "Additional action parameters merged into answer" }
  },
  "required": ["action"]
}
```

**Behavior:**
- Constructs: `{ apikey: config.aiDevsApiKey, task: config.taskName, answer: { action, ...params } }`
- POSTs to `config.verifyEndpoint` with `validateStatus: () => true`
- Checks raw response text for `/\{FLG:.*?\}/` → logs flag + `process.exit(0)` if matched

**Returns:** `JSON.stringify({ status, body })`

---

## 4. Execution Flow

```
START
  ├─ 1. centrala({ action: "help" })
  │     → learn available actions + param shapes
  ├─ 2. http_request(GET config.okoUrl) → discover login endpoint
  ├─ 3. http_request(POST login, bodyEncoding: "form", okoLogin/okoPassword)
  │     → CookieJar stores session
  ├─ 4. http_request(GET OKO reports/incidents) → find Skolwin report ID
  ├─ 5. http_request(GET OKO tasks) → find Skolwin task ID
  ├─[GOAL 1] centrala({ action: discovered, ...Skolwin report → animals })
  ├─[GOAL 2] centrala({ action: discovered, ...Skolwin task done + beavers })
  ├─[GOAL 3] centrala({ action: discovered, ...Komarowo human movement incident })
  ├─[GOAL 4] centrala({ action: "done" })
  │     → flag regex check inside centrala tool
  └─ FLAG CAPTURED → logger.agent('info', flag) → process.exit(0)
```

### Key Decision Points

- If Centrala returns an error body, agent reads it and retries with corrected params
- If OKO login requires form encoding, use `bodyEncoding: "form"`
- Agent decides when all four goals are complete, then calls `done`
- `strict: false` on both tool definitions — `body`/`headers`/`params` are open objects

---

## 5. Dependencies & Environment

### package.json additions

| Package | Purpose |
| ------- | ------- |
| `axios-cookiejar-support` | Cookie jar integration for axios |
| `tough-cookie` | Cookie jar implementation |
| `@types/tough-cookie` (dev) | TypeScript types |

### Environment Variables

```env
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.4-mini
AI_DEVS_API_KEY=
AI_DEVS_HUB_ENDPOINT=
AI_DEVS_TASK_NAME=okoeditor
OKO_URL=
OKO_LOGIN=
OKO_PASSWORD=
```

### Project Structure

```
src/
  index.ts           — entry point, calls runAgent()
  agent.ts           — Conversations + Responses API loop, MAX_ITERATIONS=30
  config.ts          — extend existing with okoUrl, okoLogin, okoPassword
  logger.ts          — unchanged
  prompts.ts         — SYSTEM_PROMPT with runtime config injection
  types.ts           — boundTools registry
  tool-factory.ts    — defineTool pattern
  tools/
    httpRequest.ts   — singleton CookieJar + axios
    centrala.ts      — /verify wrapper + flag capture
```

---

## 6. Key Implementation Notes

1. **Cookie jar** — module-level singleton in `httpRequest.ts`. Not per-call.
2. **Agent loop** — Conversations API (`client.conversations.create`) + `client.responses.create`. Use `tool_choice: 'auto'`.
3. **Config** — extend existing `config.ts` with `okoUrl`, `okoLogin`, `okoPassword` via `requireEnv()`.
4. **tool-factory.ts** — use `defineTool` pattern from `.claude/rules/openai-sdk.md`.
5. **Flag capture** — in `centrala.ts` only, per flag-capture rule. Regex on raw response text before JSON parse.
6. **MAX_ITERATIONS: 30** — sufficient for ~10 expected steps.

---

## 7. Acceptance Criteria

- [ ] `npm run dev` completes without manual intervention
- [ ] Agent calls `action: "help"` before any writes
- [ ] All writes go through `centrala` tool, never `http_request`
- [ ] All four Centrala mutations succeed
- [ ] Flag captured via regex → logged → `process.exit(0)`
- [ ] No credentials in source files
- [ ] `npm run compile:check` passes
