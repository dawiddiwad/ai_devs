# Radiomonitoring — Nasłuch Eteru

## 1. Przegląd i Cel

### Streszczenie Misji

Przechwycić transmisje radiowe z nadajnika Domatowo, przefiltrować elektromagnetyczny szum,
zdekodować materiały, i wydobyć z chaosu cztery fakty o mieście zwanym "Syjon" —
jego prawdziwe imię, powierzchnię, liczebność magazynów oraz numer kontaktowy.

### Dane Wejściowe

| Pole     | Wartość               |
| -------- | --------------------- |
| task     | `radiomonitoring`     |
| endpoint | `HUB_ENDPOINT/verify` |
| apikey   | `AI_DEVS_API_KEY`     |

### Finalna Dostawa

```json
{
	"action": "transmit",
	"cityName": "NazwaMiasta",
	"cityArea": "12.34",
	"warehousesCount": 321,
	"phoneNumber": "123456789"
}
```

---

## 2. Persona i Strategia Promptów

### System Prompt (prompts.ts)

```
You are an intelligence analyst intercepting radio transmissions.
Your mission: gather all signals first, then identify the city codenamed "Syjon".

## Workflow

1. Call listen() repeatedly until you receive "COLLECTION_COMPLETE"
2. Analyze all accumulated signals (text + images) to extract the 4 target fields
3. Call transmit() only when you have all 4 fields with high confidence

## Target Fields

- cityName: real Polish city name (not "Syjon")
- cityArea: area in km², rounded to exactly 2 decimal places, format "12.34"
- warehousesCount: number of warehouses (integer)
- phoneNumber: contact phone number (digits only, no separators)

## Rules

- Never call transmit() before COLLECTION_COMPLETE
- cityArea must be mathematically rounded, not truncated — exactly 2 decimal places
- If a field appears with conflicting values, prefer the most specific/explicit source
```

---

## 3. Architektura

Używamy `runAgent` z narzędziami — core obsługuje `AgentToolBinaryResult` natywnie.
Obrazy z narzędzi są automatycznie wstrzykiwane jako bloki `image_url` w kolejnej turze LLM.

```
src/
  index.ts        # axios POST start → runAgent(completions, tools)
  prompts.ts      # SYSTEM_PROMPT + USER_PROMPT
  tools/
    index.ts      # [listenTool, transmitTool]
    listen.ts     # POST listen → router → string | AgentToolImageResult
    transmit.ts   # verifyAnswer({action:'transmit', ...4 fields})
```

---

## 4. Przepływ Wykonania

```
START
  ├─ 1. index.ts: axios POST {action:"start"}        → init sesji
  ├─ 2. runAgent('completions', [listen, transmit])
  │      Agent loop:
  │      ├─ calls listen() repeatedly
  │      │     ├─ transcription present    → return string
  │      │     ├─ attachment, image/*      → return AgentToolImageResult{base64, mimeType}
  │      │     ├─ attachment, json/text/*  → decode locally → return string
  │      │     ├─ attachment, other/huge   → return "noise, skipped"
  │      │     └─ code != 100             → return "COLLECTION_COMPLETE"
  │      ├─ [core auto-injects images as image_url into next user message]
  │      ├─ agent accumulates full intel in context window
  │      └─ agent calls transmit({cityName, cityArea, warehousesCount, phoneNumber})
  └─ END — verifyAnswer wychwytuje flagę → process.exit(0)
```

### Kluczowe Decyzje

- Obrazy wracają jako `AgentToolImageResult` — **nigdy** surowy base64 jako string
- JSON/tekst dekodowany lokalnie (`Buffer.from(b64, 'base64').toString()`) przed zwróceniem
- Nieznane binarne / zbyt duże pliki → string z opisem szumu
- Sesja startowana deterministycznie przed `runAgent` (nie przez narzędzie)

---

## 5. Definicje Narzędzi

### 5.1 `listen`

**Opis:** Odbiera kolejną porcję sygnału radiowego.

**Schemat wejścia:**

```json
{ "type": "object", "properties": {}, "required": [] }
```

**Router:**

```
response.transcription            → return transcription string
response.attachment:
  meta startsWith 'image/'        → AgentToolImageResult { base64, mimeType: meta }
  meta: 'application/json'/'text' → Buffer.from(attachment,'base64').toString()
  else OR filesize > 500_000      → "Radio noise, no useful signal"
response.code != 100              → "COLLECTION_COMPLETE: no more signals"
```

**Zwraca:** `string | AgentToolImageResult`

---

### 5.2 `transmit`

**Opis:** Wysyła końcowy raport z danymi o mieście Syjon.

**Schemat wejścia:**

```json
{
	"type": "object",
	"properties": {
		"cityName": { "type": "string" },
		"cityArea": { "type": "string", "description": "format: '12.34'" },
		"warehousesCount": { "type": "number" },
		"phoneNumber": { "type": "string" }
	},
	"required": ["cityName", "cityArea", "warehousesCount", "phoneNumber"]
}
```

**Zachowanie:** `verifyAnswer(config, { action: 'transmit', ...args })`

**Zwraca:** string z odpowiedzią serwera; flaga wychwycona automatycznie → `process.exit(0)`

---

## 6. Zależności i Środowisko

### Importy z @ai-devs/core

| Import            | Zastosowanie                                      |
| ----------------- | ------------------------------------------------- |
| `createConfig`    | standardowa konfiguracja                          |
| `runAgent`        | pętla agenta z obsługą binarnych wyników narzędzi |
| `defineAgentTool` | fabryka narzędzi                                  |
| `verifyAnswer`    | POST do hub + wychwycenie flagi                   |
| `logger`          | logowanie operacji                                |

### Typy z @ai-devs/core (do użycia w listen.ts)

```ts
import type { AgentToolImageResult } from '@ai-devs/core'
```

### Zmienne Środowiskowe

```env
AI_DEVS_API_KEY=
OPENAI_API_KEY=
HUB_ENDPOINT=
TASK_NAME=radiomonitoring
```

---

## 7. Znane Pułapki

1. **Rozmiar base64** — nie zwracaj surowego base64 jako stringa; core obsługuje `AgentToolImageResult` poprawnie
2. **cityArea format** — string `"12.34"`, matematyczne zaokrąglenie, nie obcięcie
3. **Szum radiowy** — wiele odpowiedzi jest bez wartości; nie filtruj transkrypcji po stronie kodu, LLM poradzi sobie
4. **Koniec sesji** — `code != 100` LUB message sugerujący "enough data"; obsłuż oba przypadki w listen.ts

---

## 8. Kryteria Akceptacji

- [ ] Obrazy zwracane jako `AgentToolImageResult`, nie string z base64
- [ ] JSON/tekst dekodowany lokalnie przed zwrotem do agenta
- [ ] Nieznane binarne skipowane z opisem szumu
- [ ] `cityArea` to string z dokładnie 2 miejscami po przecinku
- [ ] Flaga wychwytywana przez `verifyAnswer` (regex, nie LLM)
- [ ] Buduje się czysto: `npm run build`
