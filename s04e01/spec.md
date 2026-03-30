# Agent `okoeditor`

## 1. Cel i zakres operacji

### Streszczenie zadania

Oto bowiem sytuacja: istnieje system o nazwie OKO — Operacyjne Centrum Kontroli — będący niczym innym jak okiem Państwa, skierowanym na wszystkie anomalie rzeczywistości. W rejestrach owego oka odnotowano zdarzenia, których tam być nie powinno. Agent zostaje wysłany, aby owe wpisy poprawić — nie niszcząc, lecz przekształcając; nie wymazując, lecz zastępując prawdą wygodniejszą.

Architektura jest dwupoziomowa — jak każdy dobry spisek: orkiestrator zna cel i wydaje rozkazy, zaś wywiadowcy wykonują brudną robotę rozpoznawczą, nie wiedząc nic o celu misji. Przeglądanie OKO odbywa się wyłącznie przez wywiadowców w trybie czysto poznawczym (tylko odczyt), zaś wszelkie zapisy wędrują wyłącznie przez Centralę, punkt weryfikacyjny systemu.

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

## 2. Architektura: Orkiestrator + Wywiadowcy

System składa się z dwóch klas bytów:

### 2.1 Orkiestrator (`src/agent.ts`)

- Model: `config.orchestratorModel` (domyślnie `gpt-5.4`)
- Narzędzia: wyłącznie `spawn_subagent` + `centrala`
- Pętla: do `MAX_ITERATIONS = 20` kroków
- Nie posiada dostępu do przeglądarki — zleca to wywiadowcom
- Zna misję w całości, podejmuje decyzje, zatwierdza wyniki

### 2.2 Wywiadowca (`src/subagent.ts`)

- Model: `config.subagentModel` (domyślnie `gpt-5.4-nano`)
- Narzędzia: narzędzia przeglądarki Playwright + `finish`
- Pętla: do `MAX_SUBAGENT_ITERATIONS = 15` kroków
- Wyłącznie odczyt OKO — zakaz wszelkich modyfikacji pod groźbą bana
- Na ostatniej iteracji wymuszony jest `tool_choice: { type: 'function', name: 'finish' }` — żeby nie marnować iteracji
- Po wywołaniu `finish(summary)` pętla kończy działanie i zwraca podsumowanie
- Spawn przez narzędzie `spawn_subagent` ze strony orkiestratora

---

## 3. Prompty systemowe

### 3.1 Orkiestrator (`SYSTEM_PROMPT`)

Znana jest mu czteropunktowa misja, przepływ pracy oraz zasada: nie podrabia identyfikatorów — czerpie je z OKO poprzez wywiadowców. Wartości wysyłane do Centrali są wiarygodne fabularnie i spójne z istniejącą treścią raportów.

```markdown
## Mission Tasks
1. Zmień klasyfikację raportu o mieście Skolwin: pojazdy/ludzie → zwierzęta
2. Na liście zadań znajdź zadanie dot. Skolwina i oznacz jako ukończone (treść: zwierzęta, np. bobry)
3. Utwórz incydent: wykryty ruch ludzki w okolicach miasta Komarowo
4. Wywołaj akcję "done" przez Centralę

## Workflow
1. centrala({ action: "help" }) — odkryj dostępne akcje
2. spawn_subagent — zbierz ID raportów, zadań, nazwy pól
3. Deleguj jednego wywiadowcę per zadanie; działaj sekwencyjnie, po jednym
4. Jeśli ban — re-spawn z zadaniem odbanowania
```

### 3.2 Wywiadowca (`SUBAGENT_SYSTEM_PROMPT`)

Wstrzyknięte dane dostępowe OKO (`okoUrl`, `okoLogin`, `okoPassword`, `aiDevsApiKey`). Obowiązuje absolutny zakaz modyfikacji — żadnych kliknięć przycisku edytuj/utwórz/zapisz/usuń/wyślij ani wymyślonych URL-i. Zawsze rozpoczyna od nawigacji do `config.okoUrl`.

---

## 4. Narzędzia

### 4.1 `spawn_subagent` (`src/tools/spawnSubagent.ts`)

**Dostępne dla:** orkiestratora

**Opis:** Tworzy nową sesję wywiadowczą (`runSubagent`), przekazując konkretne zadanie. Zwraca podsumowanie w postaci tekstu naturalnego — wszystkie ID, wartości pól, struktura strony.

**Input Schema:**

```json
{
  "type": "object",
  "properties": {
    "task": { "type": "string", "description": "Specific information to gather from OKO portal" }
  },
  "required": ["task"]
}
```

**Returns:** `string` — podsumowanie zebrane przez wywiadowcę

---

### 4.2 `finish` (`src/subagent.ts`, zamknięcie lokalne)

**Dostępne dla:** wywiadowcy

**Opis:** Sygnał zakończenia. Wywiadowca wywołuje to narzędzie, gdy zebrał wszystkie żądane dane. Narzędzie ustawia `finalSummary` przez zamknięcie leksykalne — pętla sub-agenta wykrywa to i natychmiast zwraca podsumowanie.

**Input Schema:**

```json
{
  "type": "object",
  "properties": {
    "summary": { "type": "string", "description": "Complete summary with exact IDs and field values" }
  },
  "required": ["summary"]
}
```

**Returns:** `"acknowledged"` (wewnętrznie); pętla zwraca `summary` do orkiestratora

---

### 4.3 Narzędzia przeglądarki (`src/tools/browser.ts`)

**Dostępne dla:** wywiadowcy (wyłącznie)

**Opis:** Singleton klient MCP (`@modelcontextprotocol/sdk` `StdioClientTransport`) uruchamiający `npx @playwright/mcp --headless`. Inicjalizowany leniwie przy pierwszym wywołaniu `initBrowserTools()`. Proces MCP jest współdzielony między wszystkimi wywołaniami sub-agentów — sesja przeglądarki (ciasteczka, stan nawigacji) trwa przez cały czas życia procesu Node.

Metoda `initBrowserTools()` pobiera listę dostępnych narzędzi z serwera MCP (`client.listTools()`) i filtruje je do dozwolonej listy:

| Tool                    | Opis                                             |
| ----------------------- | ------------------------------------------------ |
| `browser_navigate`      | Nawiguj do URL                                   |
| `browser_click`         | Kliknij element przez ref ze snapshotu           |
| `browser_type`          | Wpisz tekst w element                            |
| `browser_fill`          | Wypełnij pole formularza                         |
| `browser_select_option` | Wybierz opcję w liście                           |
| `browser_navigate_back` | Wróć do poprzedniej strony                       |

Każde narzędzie MCP mapowane jest na `BoundTool` ze schematem wejściowym pobranym wprost z serwera (bez ręcznego definiowania). `strict: false` — schematy Playwright zawierają opcjonalne pola.

---

### 4.4 `centrala` (`src/tools/centrala.ts`)

**Dostępne dla:** orkiestratora (wyłącznie)

**Opis:** Wysyła akcję do endpointu `/verify` Centrali. Przy każdej odpowiedzi sprawdza obecność flagi — bez wiedzy agenta, w sposób czysto mechaniczny.

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

- Konstruuje ładunek: `{ apikey, task, answer: { action, ...params } }`
- POST do `config.verifyEndpoint` z `validateStatus: () => true`
- Sprawdza surowy tekst odpowiedzi wyrażeniem `/\{FLG:.*?\}/` — jeśli dopasowanie: loguje flagę, wywołuje `process.exit(0)`

**Returns:** `JSON.stringify({ status, body })`

---

### 4.5 `http_request` (`src/tools/httpRequest.ts`)

Zachowany w kodzie źródłowym, lecz nieaktywny — nieobecny w rejestrze `staticBoundTools`. Surowe żądania HTTP dla treści nie-HTML. W obecnej architekturze zastąpiony w całości przez parę `spawn_subagent` + narzędzia przeglądarki.

---

## 5. Przebieg wykonania

```
START
  ├─ 1. centrala({ action: "help" })
  │     → poznaj dostępne akcje i kształty parametrów
  ├─ 2. spawn_subagent("Znajdź raport o Skolwinie: ID, klasyfikacja, pola")
  │     └─ Wywiadowca: navigate → login → snapshot → finish(summary)
  ├─ 3. spawn_subagent("Znajdź zadanie dot. Skolwina: ID, status, treść")
  │     └─ Wywiadowca: navigate → find task → finish(summary)
  ├─[MISJA 1] centrala({ action: ..., Skolwin report ID → klasyfikacja: zwierzęta })
  ├─[MISJA 2] centrala({ action: ..., Skolwin task ID → done + bobry })
  ├─ 4. spawn_subagent("Zweryfikuj formularz tworzenia incydentu — dostępne pola")
  │     └─ (opcjonalnie, jeśli potrzeba sprawdzić strukturę)
  ├─[MISJA 3] centrala({ action: ..., nowy incydent: Komarowo + ruch ludzki })
  ├─[MISJA 4] centrala({ action: "done" })
  │     → centrala tool sprawdza surowy tekst /\{FLG:.*?\}/
  └─ FLAGA SCHWYTANA → logger.agent('info', flag) → process.exit(0)
```

### Kluczowe punkty decyzyjne

- Centrala zwraca błąd → orkiestrator czyta ciało odpowiedzi, koryguje parametry, ponawia
- Ban na OKO → orkiestrator re-spawna wywiadowcę z zadaniem odbanowania
- Wywiadowca nie wywołał `finish` w czasie → zwracany jest ostatni komunikat asystenta
- `strict: false` na narzędziach przeglądarki — schematy MCP zawierają opcjonalne pola

---

## 6. Zależności i środowisko

### Pakiety

| Pakiet                      | Cel                                       |
| --------------------------- | ----------------------------------------- |
| `openai`                    | Responses API + Conversations API         |
| `@playwright/mcp`           | Serwer MCP Playwright (Microsoft)         |
| `@modelcontextprotocol/sdk` | Klient MCP (`StdioClientTransport`)       |
| `zod`                       | Schematy wejściowe narzędzi               |
| `axios`                     | HTTP dla `centrala` + `http_request`      |
| `dotenv`                    | Wczytywanie zmiennych środowiskowych      |

### Zmienne środowiskowe

```env
OPENAI_API_KEY=
ORCHESTRATOR_MODEL=gpt-5.4        # opcjonalnie
SUBAGENT_MODEL=gpt-5.4-nano       # opcjonalnie
AI_DEVS_API_KEY=
AI_DEVS_HUB_ENDPOINT=
AI_DEVS_TASK_NAME=okoeditor
OKO_URL=
OKO_LOGIN=
OKO_PASSWORD=
```

### Struktura projektu

```
src/
  index.ts              — punkt wejścia, wywołuje runAgent()
  agent.ts              — pętla orkiestratora (MAX_ITERATIONS=20)
  subagent.ts           — pętla wywiadowcy (MAX_SUBAGENT_ITERATIONS=15)
  config.ts             — orchestratorModel, subagentModel, okoUrl, okoLogin, okoPassword
  logger.ts             — bez zmian
  prompts.ts            — SYSTEM_PROMPT (orkiestrator) + SUBAGENT_SYSTEM_PROMPT (wywiadowca)
  types.ts              — staticBoundTools: [spawnSubagentTool, centralaTool]
  tool-factory.ts       — wzorzec defineTool
  tools/
    spawnSubagent.ts    — narzędzie orkiestratora → wywołuje runSubagent()
    finish.ts           — definicja bazowa; aktywna wersja jako zamknięcie w subagent.ts
    browser.ts          — singleton MCP → @playwright/mcp --headless
    centrala.ts         — wrapper /verify + przechwytywanie flagi
    httpRequest.ts      — nieaktywny (zachowany)
```

---

## 7. Uwagi implementacyjne

1. **Stan przeglądarki** — klient MCP jest singletonem na poziomie procesu. Sesja logowania do OKO z pierwszego wywiadowcy trwa dla kolejnych. Każdy wywiadowca powinien mimo to zaczynać od `browser_navigate` do `config.okoUrl` — nie zakładać stanu.
2. **Wymuszenie `finish`** — na ostatniej iteracji wywiadowcy (`i === MAX_SUBAGENT_ITERATIONS - 1`) ustawiany jest `tool_choice: { type: 'function', name: 'finish' }`. Gwarantuje to podsumowanie zamiast marnowania iteracji na kolejne narzędzie.
3. **`finish` jako zamknięcie** — `finishTool` tworzony jest wewnątrz `runSubagent()` z dostępem do zmiennej `finalSummary`. Pętla sprawdza `finalSummary !== null` po każdej iteracji i przerywa.
4. **TypeScript** — `module: node16` + `moduleResolution: node16` wymagane do rozwiązania sub-ścieżek eksportów `@modelcontextprotocol/sdk`. Import: `from '@modelcontextprotocol/sdk/client/index.js'` (z rozszerzeniem `.js`).
5. **Flag capture** — wyłącznie w `centrala.ts`, zgodnie z regułą flag-capture. Regex na surowym tekście przed parsowaniem JSON.
6. **Playwright install** — `npx playwright install chromium` (jednorazowo po `npm install`).

---

## 8. Kryteria akceptacji

- [ ] `npm run dev` kończy działanie bez interwencji człowieka
- [ ] Orkiestrator wywołuje `action: "help"` przed pierwszym zapisem
- [ ] Wszystkie zapisy przechodzą przez narzędzie `centrala` — wywiadowcy nic nie piszą
- [ ] Wywiadowcy nie klikają żadnych przycisków modyfikujących dane OKO
- [ ] Cztery misje zakończone sukcesem
- [ ] Flaga schwytana przez regex → zalogowana → `process.exit(0)`
- [ ] Żadnych danych uwierzytelniających w kodzie źródłowym
- [ ] `npm run compile:check` zaliczony
