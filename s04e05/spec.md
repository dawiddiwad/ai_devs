# Infiltracja Magazynów Zygfryda, czyli `foodwarehouse`

## 1. Przegląd i Cel Operacji

### Streszczenie Misji

Nasz automat, działając na zlecenie Azazela, wkrada się wirtualnie do systemów dystrybucji magazynów Zygfryda. Zadanie polega na przeprogramowaniu zamówień tak, aby towary trafiły do potrzebujących miast. Agent odkrywa API poprzez komendę `help`, bada schemat bazy SQLite, generuje kryptograficzne podpisy SHA1 i tworzy jedno zamówienie na każde miasto — wypełnione dokładnie tym, czego potrzebuje.

### Parametry Brzegowe

| Współrzędna          | Wartość                                         |
| -------------------- | ----------------------------------------------- |
| Kryptonim misji      | `foodwarehouse`                                 |
| Ołtarz weryfikacji   | `config.verifyEndpoint` (`HUB_ENDPOINT/verify`) |
| Plik zapotrzebowania | `HUB_ENDPOINT/dane/food4cities.json`            |
| Baza danych          | SQLite (tylko odczyt)                           |

### Artefakt

Flaga `{FLG:...}` zwrócona przez API po wywołaniu `done` z kompletnymi i poprawnymi zamówieniami.

---

## 2. Persona i Strategia Promptów

### System Prompt

```
You are a warehouse infiltration agent. Your mission: create exactly one order per city
listed in the food requirements file, each order containing the exact goods that city needs.

## Workflow

1. Call warehouse_api with tool="help" to discover the full API schema
2. Call fetch_requirements to get city names and their goods requirements
3. Call warehouse_api with tool="database" and query="show tables" to explore the SQLite schema
4. Query the database to find destination codes for each city and creator user data needed for signatures
5. For each city:
   a. Generate SHA1 signature via warehouse_api with tool="signatureGenerator"
   b. Create order via warehouse_api with tool="orders", action="create"
   c. Append all goods in one batch call via warehouse_api with tool="orders", action="append", items as object
6. Call warehouse_api with tool="done" to finalize

## Rules

- Always start with help to understand the API
- Use reset if state gets corrupted, then redo all orders from step 5
- Always batch-append items (items as object map) — not one by one
- Never call done before every city has a complete order
- creatorID and destination come from the database — discover them via SQL queries
- Signature is generated per order — call signatureGenerator for each city
```

---

## 3. Instrumentarium

### 3.1 `warehouse_api`

**Opis:** Generyczny wrapper wszystkich wywołań API magazynu. Wszystkie requesty trafiają do `/verify` z `answer: { tool, ...params }`.

**Schemat:**

```json
{
	"tool": "string — np. help, orders, database, signatureGenerator, reset, done",
	"params": "object (optional) — dodatkowe pola mergowane do payloadu, np. { action: 'get' }"
}
```

**Zachowanie:** Scala `{ tool, ...params }` i wywołuje `verifyAnswer(config, merged, { exitOnFlag: true })`.

**Zwraca:** `responseText` z API.

### 3.2 `fetch_requirements`

**Opis:** Pobiera plik JSON z zapotrzebowaniem miast.

**Schemat:** `{}` (brak parametrów)

**Zachowanie:** GET na `HUB_ENDPOINT/dane/food4cities.json` przez `https.get`.

**Zwraca:** Zawartość JSON jako string.

---

## 4. Przepływ Wykonania

```
START
  ├─ 1. warehouse_api({ tool: "help" })               → poznaj pełne API
  ├─ 2. fetch_requirements()                           → lista miast + towary
  ├─ 3. warehouse_api({ tool: "database", query: "show tables" })
  ├─ 4. warehouse_api({ tool: "database", query: "SELECT ..." })  × kilka zapytań
  │      → kody destination dla każdego miasta
  │      → dane użytkownika do creatorID i signatureGenerator
  ├─ 5. Dla każdego miasta:
  │      a. warehouse_api signatureGenerator           → SHA1
  │      b. warehouse_api orders.create               → { creatorID, destination, signature }
  │      c. warehouse_api orders.append               → { items: { towar: ilość, ... } }
  ├─ 6. warehouse_api({ tool: "done" })                → finalna weryfikacja + flaga
  └─ END
```

**Odzysk po błędzie:** `warehouse_api({ tool: "reset" })` → powtórz krok 5 dla wszystkich miast.

---

## 5. Zależności i Środowisko

### Paczki

Brak dodatkowych — `@ai-devs/core` + `zod` + wbudowany moduł `https` Node.js.

### Zmienne Środowiskowe

```env
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-5.4-mini
AI_DEVS_API_KEY=...
AI_DEVS_TASK_NAME=foodwarehouse
AI_DEVS_HUB_ENDPOINT=
```

### Struktura Projektu

```
src/
  index.ts                   # runAgent z api: 'completions'
  prompts.ts                 # SYSTEM_PROMPT + USER_PROMPT
  tools/
    index.ts                 # rejestr narzędzi
    warehouse-api.ts         # wrapper wszystkich wywołań API
    fetch-requirements.ts    # HTTP GET food4cities.json
```

---

## 6. Kluczowe Uwagi Implementacyjne

1. `warehouse_api` scala `{ tool, ...params }` — agent przekazuje `params` jako płaski obiekt
2. `verifyAnswer` w `warehouse-api.ts` używa `exitOnFlag: true` — flaga przechwycona programowo
3. Batch append: `{ items: { "chleb": 45, "woda": 120 } }` — nie pojedyncze wpisy
4. Schema SQLite jest nieznana z góry — agent musi ją odkryć via `show tables` + `describe`/`select`
5. `signatureGenerator` — format wejścia poznany z `help`, zapewne wymaga danych użytkownika z DB

---

## 7. Kryteria Akceptacji

- [ ] `npm run build` — kompiluje bez błędów
- [ ] Agent odkrywa API via `help` jako pierwszy krok
- [ ] Agent odpytuje SQLite i wyciąga destination + dane do podpisu
- [ ] Tworzy jedno zamówienie per miasto z SHA1, creatorID, destination
- [ ] Batch-append towarów dla każdego zamówienia
- [ ] Flaga przechwycona programowo po `done`
- [ ] `process.exit(0)` po przechwyceniu flagi
