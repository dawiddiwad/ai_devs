# AI Agent for Windpower Turbine Scheduler

## 1. Overview & Goal

### Task Summary

Zaprogramować harmonogram pracy turbiny wiatrowej tak, aby wygenerować brakującą energię, zabezpieczając turbinę przed wichurami — wszystko w czasie **40 sekund**. Sekwencja jest deterministyczna, lecz API jest w większości asynchroniczne: najpierw kolejkujesz zadanie, potem odbierasz wynik przez `getResult`. Zadania muszą być kolejkowane **równolegle** (Promise.all), inaczej nie zmieścisz się w oknie czasowym.

### Hardcoded Inputs / Initial Data

| Field           | Value                         |
| --------------- | ----------------------------- |
| task            | `windpower`                   |
| verify endpoint | `AI_DEVS_HUB_ENDPOINT/verify` |

### Final Deliverable

Flaga `{FLG:...}` zwrócona przez akcję `done` po poprawnej konfiguracji turbiny.

---

## 2. Architecture Decision

**Brak pętli agentowej** — czas na wykonanie to 40 sekund. LLM per-iteration overhead (2-5s × wiele iteracji) wyklucza klasyczny agent loop. Rozwiązanie to **skrypt proceduralny** (`runner.ts`) z Promise.all dla równoległości. LLM używany **jednorazowo** do analizy danych pogodowych i wyznaczenia konfiguracji.

```
src/
  index.ts       ← entry point
  runner.ts      ← główna orkiestracja (zamiast agent.ts)
  api.ts         ← klient windpower API
  analyzer.ts    ← jednorazowe wywołanie OpenAI do analizy
  config.ts      ← env vars
  logger.ts      ← structured logging
  types.ts       ← Zod schemas
```

---

## 3. API Client (`api.ts`)

Wszystkie żądania mają format:

```json
{
  "apikey": "...",
  "task": "windpower",
  "answer": { "action": "...", ...params }
}
```

### Kluczowe akcje

| Akcja                 | Typ   | Opis                                            |
| --------------------- | ----- | ----------------------------------------------- |
| `help`                | sync  | Dokumentacja API — nazwy funkcji i pól          |
| `start`               | sync  | Otwiera okno serwisowe                          |
| `<fn_name>`           | async | Kolejkuje zadanie, zwraca `{jobId}`             |
| `getResult`           | sync  | Odbiera wynik po jobId — może zwrócić "pending" |
| `unlockCodeGenerator` | async | Generuje podpis MD5 dla konfiguracji            |
| `config`              | sync  | Przesyła konfigurację (batch lub single)        |
| `turbinecheck`        | sync  | Test turbiny przed finalizacją                  |
| `done`                | sync  | Weryfikacja — zwraca flagę                      |

> **Uwaga:** Nazwy funkcji do weather/turbine/power są nieznane przed wywołaniem `help`. Odkryć je w runtime.

### `callApi(action, params?)` — wrapper

```ts
async function callApi(action: string, params?: Record<string, unknown>): Promise<unknown>
```

Zawsze `validateStatus: () => true`. Nigdy nie rzuca na błędy HTTP.

### `pollResult(jobId, intervalMs, timeoutMs)` — polling loop

```ts
async function pollResult(jobId: string, intervalMs = 500, timeoutMs = 15000): Promise<unknown>
```

Pętla z `await sleep(intervalMs)` dopóki wynik nie jest "pending". Rzuca po timeoutMs.

---

## 4. Analyzer (`analyzer.ts`)

**Jednorazowe wywołanie OpenAI** z danymi pogody + specs turbiny + wymaganiami energetycznymi.

### Input

```ts
{
  weatherForecast: unknown,   // dane z API
  turbineSpecs: unknown,      // max wind speed, etc.
  powerRequirements: unknown, // kiedy potrzeba energii
}
```

### Output (Zod schema)

```ts
const TurbineConfigSchema = z.object({
	stormPeriods: z.array(
		z.object({
			datetime: z.string(), // "YYYY-MM-DD HH:00:00"
			pitchAngle: z.number(),
			turbineMode: z.literal('idle'),
		})
	),
	productionPoint: z.object({
		datetime: z.string(),
		pitchAngle: z.number(),
		turbineMode: z.literal('production'),
	}),
})
```

### System prompt (analiza)

```
Jesteś inżynierem turbiny wiatrowej. Przeanalizuj dane pogodowe i specyfikację turbiny.

Reguły:
1. Wichura = wiatr > turbineSpecs.maxWindSpeed
2. Przy wichurze: turbineMode=idle, pitchAngle minimalizuje opór (sprawdź specs)
3. Punkt produkcji: najlepszy czas w ramach wymagań energetycznych, wiatr w bezpiecznym zakresie
4. Godziny: zawsze minuty i sekundy = 00
5. Format datetime: "YYYY-MM-DD HH:00:00"

Zwróć JSON zgodny ze schematem.
```

---

## 5. Execution Flow (`runner.ts`)

```
START
  ├─ 1. callApi('help') → poznaj nazwy funkcji async
  ├─ 2. callApi('start') → otwórz okno serwisowe
  │
  ├─ 3. Promise.all → kolejkuj równolegle:
  │       callApi('weatherForecast') → jobId_weather
  │       callApi('turbineStatus')   → jobId_turbine
  │       callApi('powerReport')     → jobId_power
  │       (nazwy funkcji z help)
  │
  ├─ 4. Promise.all → pollResult dla wszystkich jobId
  │       [weatherData, turbineData, powerData]
  │
  ├─ 5. analyze(weatherData, turbineData, powerData)
  │       → { stormPeriods[], productionPoint }
  │
  ├─ 6. Promise.all → kolejkuj unlockCodeGenerator dla każdego punktu:
  │       stormPeriods + productionPoint → N × jobId_code
  │
  ├─ 7. Promise.all → pollResult dla wszystkich kodów
  │       → unlockCodes[]
  │
  ├─ 8. callApi('config', { configs: { datetime: { pitchAngle, turbineMode, unlockCode } } })
  │
  ├─ 9. callApi('turbinecheck') → musi przejść
  │
  └─ 10. callApi('done') → regex FLAG_REGEX → process.exit(0)
```

### Key Decision Points

- **Funkcja `help`** zwróci prawdziwe nazwy async action — zapisz je w zmiennej przed użyciem
- **`getResult` polling** — wyniki przychodzą w losowej kolejności, matchuj po jobId
- **Batch config format** — używaj wariantu `configs: { "YYYY-MM-DD HH:00:00": {...} }` dla wielu punktów
- **`turbinecheck` musi przejść** przed `done` — jeśli fail, sprawdź kody i ponów `config`
- **Czas na polling** — jeśli wszystkie polle lecą równolegle (Promise.all), łączny czas ≈ max(single_poll)

---

## 6. Flag Capture

```ts
// w callApi po akcji 'done':
const FLAG_REGEX = /\{FLG:.*?\}/
const flagMatch = responseText.match(FLAG_REGEX)
if (flagMatch) {
	logger.agent('info', `FLAG CAPTURED: ${flagMatch[0]}`)
	process.exit(0)
}
```

---

## 7. Dependencies & Environment

### Environment Variables

```env
OPENAI_API_KEY=...
AI_DEVS_API_KEY=...
AI_DEVS_HUB_ENDPOINT=***hub_endpoint***
AI_DEVS_TASK_NAME=windpower
OPENAI_MODEL=gpt-5.4-nano
```

### package.json additions

| Package  | Purpose           |
| -------- | ----------------- |
| `axios`  | HTTP client       |
| `openai` | Analysis LLM call |
| `zod`    | Schema validation |
| `dotenv` | Env loading       |

---

## 8. Key Implementation Notes

1. **Nie używaj agent loop** — sekwencja jest znana z góry, LLM służy tylko do analizy
2. **Promise.all jest obowiązkowe** na krokach 3, 4, 6, 7 — inaczej przekroczysz 40s
3. **Wywołaj `help` najpierw** — bez tego nie znasz nazw funkcji async API
4. **Format datetime w config** — zawsze `HH:00:00`, nigdy minuty/sekundy != 0
5. **unlockCode jest wymagany dla każdego punktu** — bez niego API odrzuci config
6. **validateStatus: () => true** w callApi — nieudane odpowiedzi zawierają wskazówki
7. **turbinecheck przed done** — wymagane w specyfikacji zadania

---

## 9. Acceptance Criteria

- [ ] Wykonanie mieści się w 40 sekundach
- [ ] Wszystkie okresy wichury mają turbineMode=idle
- [ ] Punkt produkcji ma turbineMode=production
- [ ] Każdy punkt konfiguracji ma poprawny unlockCode
- [ ] turbinecheck zakończony sukcesem
- [ ] Flaga wychwycona przez regex, nie LLM
- [ ] Buduje się czysto (`npm run build`)
