# Agent `okoeditor`

## 1. Cel i zakres operacji

### Streszczenie zadania

Oto bowiem sytuacja: istnieje system o nazwie OKO — Operacyjne Centrum Kontroli — będący niczym innym jak okiem Państwa, skierowanym na wszystkie anomalie rzeczywistości. W rejestrach owego oka odnotowano zdarzenia, których tam być nie powinno. Agent zostaje wysłany, aby owe wpisy poprawić — nie niszcząc, lecz przekształcając; nie wymazując, lecz zastępując prawdą wygodniejszą. Przeglądanie OKO odbywa się w trybie czysto poznawczym (tylko odczyt), zaś wszelkie zapisy wędrują wyłącznie przez Centralę, punkt weryfikacyjny systemu, któremu ufamy, gdyż nie mamy innego wyjścia.

### Dane wejściowe

| Pole                       | Wartość                                                                |
| -------------------------- | ---------------------------------------------------------------------- |
| Adres OKO                  | `config.okoUrl` (ze zmiennych środowiskowych)                          |
| Dane uwierzytelniające OKO | `config.okoLogin` / `config.okoPassword` (ze zmiennych środowiskowych) |
| Endpoint Centrali          | `config.verifyEndpoint`                                                |
| Nazwa zadania              | `okoeditor`                                                            |

### Produkt końcowy

Flaga w formacie `/\{FLG:.*?\}/`, wydobyta z odpowiedzi Centrali na akcję `done`. Zalogowana, po czym `process.exit(0)` — albowiem po schwytaniu flagi nie ma już nic do roboty.

---

## 2. Persona agenta i strategia promptu

Dane uwierzytelniające wstrzykiwane są w czasie wykonania z obiektu `config` — nigdy nie pojawiają się w kodzie źródłowym, bo kod źródłowy jest dokumentem publicznym, a tajemnica — prywatną własnością.

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

## 3. Narzędzia

### 3.1 `http_request`

**Opis:** Narzędzie do komunikacji z API OKO. Przechowuje ciasteczka sesji w wewnętrznym słoiku (cookie jar), niewidocznym dla agenta — ów słoik jest duszą sesji, cierpliwie zbierającą tożsamość przez kolejne żądania.

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

**Działanie:**

- Singleton `CookieJar` + klient axios opakowany przez `axios-cookiejar-support` i `tough-cookie` — tworzony raz na cały czas życia procesu
- `validateStatus: () => true` — błędy HTTP nie są wyjątkami, lecz informacjami
- `bodyEncoding: "form"` → `URLSearchParams` + `Content-Type: application/x-www-form-urlencoded`

**Returns:** `JSON.stringify({ status, body })` — body jako sparsowany JSON lub surowy łańcuch znaków

---

### 3.2 `centrala`

**Opis:** Wysyła akcję do endpointu `/verify` Centrali, opakowując ładunek w standardowy format protokołu. Przy każdej odpowiedzi sprawdza obecność flagi — bez wiedzy agenta, w sposób czysto mechaniczny, jak stróż czytający każdy list.

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

**Działanie:**

- Konstruuje ładunek: `{ apikey: config.aiDevsApiKey, task: config.taskName, answer: { action, ...params } }`
- POST do `config.verifyEndpoint` z `validateStatus: () => true`
- Sprawdza surowy tekst odpowiedzi wyrażeniem `/\{FLG:.*?\}/` — jeśli dopasowanie: loguje flagę, wywołuje `process.exit(0)`

**Returns:** `JSON.stringify({ status, body })`

---

## 4. Przebieg wykonania

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
  │     → centrala tool checks raw response for /\{FLG:.*?\}/
  └─ FLAG CAPTURED → logger.agent('info', flag) → process.exit(0)
```

### Kluczowe punkty decyzyjne

- Centrala zwraca błąd → agent czyta ciało odpowiedzi, koryguje parametry, ponawia
- Logowanie OKO wymaga form-encoding → `bodyEncoding: "form"`
- `strict: false` na obu definicjach narzędzi — pola `body`, `headers`, `params` są otwartymi obiektami

---

## 5. Zależności i środowisko

### Nowe pakiety

| Pakiet                      | Cel                           |
| --------------------------- | ----------------------------- |
| `axios-cookiejar-support`   | Integracja cookie jar z axios |
| `tough-cookie`              | Implementacja cookie jar      |
| `@types/tough-cookie` (dev) | Typy TypeScript               |

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
  config.ts          — extend with okoUrl, okoLogin, okoPassword
  logger.ts          — unchanged
  prompts.ts         — SYSTEM_PROMPT with runtime config injection
  types.ts           — boundTools registry
  tool-factory.ts    — defineTool pattern
  tools/
    httpRequest.ts   — singleton CookieJar + axios
    centrala.ts      — /verify wrapper + flag capture
```

---

## 6. Uwagi implementacyjne

1. **Cookie jar** — singleton na poziomie modułu w `httpRequest.ts`. Nie tworzyć per wywołanie.
2. **Pętla agenta** — `client.conversations.create` + `client.responses.create`. Pole `reasoning` pominąć (gpt nie jest modelem o-series). `tool_choice: 'auto'`.
3. **Config** — rozszerzyć istniejący `config.ts` o `okoUrl`, `okoLogin`, `okoPassword` przez `requireEnv()`.
4. **tool-factory.ts** — wzorzec `defineTool` z `.claude/rules/openai-sdk.md`.
5. **Flag capture** — wyłącznie w `centrala.ts`, zgodnie z regułą flag-capture. Regex na surowym tekście przed parsowaniem JSON.
6. **MAX_ITERATIONS: 30** — wystarczające dla ~10 przewidywanych kroków.

---

## 7. Kryteria akceptacji

- [ ] `npm run dev` kończy działanie bez interwencji człowieka
- [ ] Agent wywołuje `action: "help"` przed pierwszym zapisem
- [ ] Wszystkie zapisy przechodzą przez narzędzie `centrala`, nigdy `http_request`
- [ ] Cztery mutacje zakończone sukcesem
- [ ] Flaga schwytana przez regex → zalogowana → `process.exit(0)`
- [ ] Żadnych danych uwierzytelniających w kodzie źródłowym
- [ ] `npm run compile:check` zaliczony
