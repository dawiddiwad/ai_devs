# Rakieta Pośród Zakłóceń `goingthere`

## 1. Overview & Goal

### Task Summary

Trzeba powołać do istnienia Agenta-Nawigatora, istotę o ograniczonej, lecz dostatecznej przenikliwości, która przeprowadzi rakietę naziemną przez pas pustkowia ku Grudziądzowi. Świat ten jest mały, ale złośliwy: skały stoją na torze lotu, radio kłamie półgębkiem, a system OKO co pewien czas próbuje zamienić podróżnika w krótki błysk i jeszcze krótszy nekrolog.

Agent nie ma rozwiązać problemu przez brutalną siłę kodu ukrytego poza jego świadomością. Ma działać jak prawdziwy pilot narzędziowy: rozpoczynać grę, przed każdym ruchem sprawdzać namierzenie, w razie potrzeby rozbrajać radar, słuchać radiowej wskazówki o skale w następnej kolumnie i wybrać właściwy ruch, aż do dotarcia do bazy.

Odporność na entropię musi jednak tkwić nie w poezji promptu, lecz w instrumentach:

- losowe błędy API muszą być ponawiane automatycznie
- retry ma mieć ograniczony budżet i krótki backoff z jitterem
- narzędzia mają zwracać surowe payloady, bez lokalnego parsowania semantyki
- interpretacja treści odpowiedzi należy do LLM

### Hardcoded Inputs / Initial Data

| Field                  | Value                                                   |
| ---------------------- | ------------------------------------------------------- |
| task                   | `goingthere`                                            |
| verify endpoint        | `HUB_ENDPOINT/verify`                                   |
| hint endpoint          | `HUB_ENDPOINT/api/getmessage`                           |
| frequency scanner GET  | `HUB_ENDPOINT/api/frequencyScanner?key=AI_DEVS_API_KEY` |
| frequency scanner POST | `HUB_ENDPOINT/api/frequencyScanner`                     |
| grid size              | 3 rows x 12 columns                                     |
| start position         | row `2`, column `1`                                     |
| target column          | `12`                                                    |
| movement commands      | `go`, `left`, `right`                                   |
| start command          | `start`                                                 |
| rock count             | exactly one rock in each column                         |
| disarm hash formula    | `SHA1(detectionCode + "disarm")`                        |

### Final Deliverable

Flaga zwrócona przez system po bezpiecznym dotarciu rakiety do Grudziądza. Nie ma osobnego finałowego payloadu poza komendami gry; flaga zostaje przechwycona programowo z odpowiedzi API.

---

## 2. Agent Persona & Prompt Strategy

### System Prompt

```markdown
You are an autonomous agent solving the "goingthere" navigation task. Your primary goal is to navigate the simulated rocket successfully to the base in Grudziądz.

Pilot a rocket on a 3×12 grid from column 1 (row 2) to the target base in column 12. Each column has one rock to avoid. Radar traps shoot you down if not disarmed first.

**Each turn, follow this exact sequence:**

1. Listen to the frequency scanner
2. If it's not 'clear' parse (possibly malformed) JSON for 'frequency' and 'detectionCode' and use them to disarm the radar trap.
3. Get the radio hint and parse it for rock direction (left/right/ahead) — may use nautical language.
4. Choose move (go/left/right) to avoid the rock and stay within rows 1–3.
```

---

## 3. Tool Definitions

W obecnym rozwiązaniu są to narzędzia Mastra definiowane przez `createTool({ inputSchema, outputSchema, execute })`. Poniższe nazwy pozostają nazwami pojęciowymi; implementacja używa odpowiadających im identyfikatorów Mastra: `start-game`, `frequency-scanner`, `get-radio-hint`, `move-rocket`.

### 3.1 `start_game`

**Description:** Rozpoczyna nową grę komendą `start` i zwraca surową odpowiedź systemu.

**Input Schema:**

```json
{
	"type": "object",
	"properties": {},
	"required": [],
	"additionalProperties": false
}
```

**Behavior:**

- wywołuje `verifyAnswer(config, { command: "start" })`
- przechwytuje flagę standardowym mechanizmem `verifyAnswer`
- nie interpretuje semantyki odpowiedzi lokalnie
- zwraca surowy payload jako string

**Returns:**

- JSON-string z bieżącym stanem gry po starcie

---

### 3.2 `frequency_scanner`

**Description:** Obsługuje skaner systemu OKO w dwóch trybach: nasłuch (`listen`) i rozbrojenie (`disarm`).

**Input Schema:**

```json
{
	"type": "object",
	"properties": {
		"action": {
			"type": "string",
			"enum": ["listen", "disarm"]
		},
		"frequency": {
			"type": ["number", "null"]
		},
		"detectionCode": {
			"type": ["string", "null"]
		}
	},
	"required": ["action", "frequency", "detectionCode"],
	"additionalProperties": false
}
```

**Behavior:**

- dla `action = "listen"` oczekuje `frequency = null` i `detectionCode = null`, po czym wykonuje GET przez `axios` do `frequencyScanner`
- dla `action = "disarm"` oczekuje `frequency` i `detectionCode`, lokalnie liczy `SHA1(detectionCode + "disarm")`, a następnie wykonuje POST do `frequencyScanner` z `frequency` i wyliczonym `disarmHash`
- ponawia żądania przy błędach HTTP i losowych awariach API
- nie parsuje odpowiedzi skanera lokalnie
- zwraca surowy payload jako string

**Returns:**

- surowy payload zwrócony przez skaner jako string

---

### 3.3 `get_radio_hint`

**Description:** Pobiera bieżącą radiową wskazówkę o położeniu skały w następnej kolumnie.

**Input Schema:**

```json
{
	"type": "object",
	"properties": {},
	"required": [],
	"additionalProperties": false
}
```

**Behavior:**

- wykonuje POST przez `axios` do `/api/getmessage` z `apikey`
- ponawia żądanie przy losowych błędach API
- nie interpretuje semantyki wskazówki za Agenta
- zwraca surowy payload jako string

**Returns:**

- surowy payload wskazówki jako string

---

### 3.4 `move_rocket`

**Description:** Wykonuje pojedynczy ruch rakiety.

**Input Schema:**

```json
{
	"type": "object",
	"properties": {
		"command": {
			"type": "string",
			"enum": ["go", "left", "right"]
		}
	},
	"required": ["command"],
	"additionalProperties": false
}
```

**Behavior:**

- wywołuje `verifyAnswer(config, { command })`
- przechwytuje flagę standardowym mechanizmem `verifyAnswer`
- nie interpretuje semantyki odpowiedzi lokalnie
- zwraca surowy payload jako string

**Returns:**

- JSON-string z wynikiem ruchu

---

## 4. Execution Flow

```text
START
  ├─ 1. start_game()
  ├─ 2. Agent parsuje raw payload: currentRow, currentColumn, targetRow
  ├─ 3. frequency_scanner({ action: "listen" })
  │      └─ jeśli nie jest clear -> agent wydobywa frequency + detectionCode -> frequency_scanner({ action: "disarm", frequency, detectionCode })
  ├─ 4. get_radio_hint()
  ├─ 5. Agent parsuje hint i wyznacza blockedCommand
  ├─ 6. Agent wybiera bezpieczny ruch zgodny z granicami mapy i targetRow
  ├─ 7. move_rocket(command)
  │      ├─ jeśli raw payload oznacza sukces -> flaga -> END
  │      ├─ jeśli raw payload oznacza katastrofę -> start_game() i nowa pętla
  │      └─ w przeciwnym razie -> powrót do kroku 3
  └─ END
```

### Key Decision Points

1. Jeśli `frequency_scanner({ action: "listen" })` zwróci błąd po pełnym budżecie retry, agent wywołuje to narzędzie ponownie zamiast wykonywać ruch w ciemno.
2. Jeśli wskazówka blokuje ruch prowadzący do celu, agent wybiera inny bezpieczny ruch i dopiero w kolejnych kolumnach wraca ku `targetRow`.
3. Jeśli istnieje tylko jeden ruch bezpieczny i legalny, agent wykonuje go bez wahania.
4. Jeśli surowa odpowiedź z `move_rocket` oznacza stan katastrofy, agent nie próbuje kontynuować starej mapy, tylko zaczyna od nowa.
5. Każdy nowy `start_game()` traktowany jest jako nowy wszechświat: nowa mapa, nowy stan, potencjalnie nowy `targetRow`.

---

## 5. Dependencies & Environment

### package.json dependencies

| Package                                                                        | Purpose                                                   |
| ------------------------------------------------------------------------------ | --------------------------------------------------------- |
| `mastra`, `@mastra/core`                                                       | runtime Agenta i definicje narzędzi                       |
| `@mastra/memory`, `@mastra/libsql`                                             | pamięć rozmowy i trwały store lokalny                     |
| `@mastra/observability`, `@mastra/loggers`, `@mastra/editor`, `@mastra/duckdb` | obserwowalność, logowanie, studio i storage telemetryczny |
| `@ai-devs/core`                                                                | `createConfig`, `logger`, `verifyAnswer`                  |
| `axios`                                                                        | wywołania HTTP do `getmessage` i `frequencyScanner`       |
| `zod`                                                                          | schemy wejść i wyjść narzędzi                             |
| `dotenv`                                                                       | ładowanie zmiennych środowiskowych w runtime Mastra       |

### Environment Variables

```env
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.4-mini
AI_DEVS_API_KEY=
AI_DEVS_TASK_NAME=goingthere
AI_DEVS_HUB_ENDPOINT=***hub_endpoint***
```

Obecna implementacja agenta i tak jawnie ustawia model na `openai/gpt-5.4-mini` w `src/rocket-agent.ts`.

### Project Structure

```text
src/
  mastra/
    index.ts                   # rejestracja agenta, narzędzi, storage i observability
  rocket-agent.ts              # instrukcje Agenta i jego konfiguracja
  tools/
    start-game.ts              # Mastra tool: start przez verify endpoint
    frequency-scanner.ts       # Mastra tool: listen/disarm + retry
    get-radio-hint.ts          # Mastra tool: getmessage wrapper z retry
    move-rocket.ts             # Mastra tool: go/left/right przez verify endpoint
    shared.ts                  # wspólne helpery stringify/filter dla payloadów
  utils/
    retry.ts                   # bounded retry z backoffem i jitterem
```

---

## 6. Key Implementation Notes

1. Użyć Mastra `Agent`, a nie własnej pętli `runAgent()`. Instrukcje Agenta trzymać w `src/rocket-agent.ts`.
2. Zarejestrować agenta oraz cztery narzędzia domenowe w `src/mastra/index.ts`.
3. Ustawić limity wykonania wyżej niż domyślne minimum, np. `maxSteps: 100`, bo pełne przejście może wymagać wielu tur i restartów.
4. Retry musi żyć w kodzie narzędzi, nie w modelu. Obecna implementacja używa budżetu `10` prób oraz backoffu wykładniczego z jitterem.
5. Wszystkie wywołania HTTP poza `verifyAnswer` prowadzić przez `axios`.
6. Narzędzia mają zwracać surowy payload jako string; interpretacja treści pozostaje po stronie LLM.
7. `frequency_scanner` ma mieć dwa tryby: `listen` i `disarm`, przy czym w trybie `disarm` przyjmuje `detectionCode`, a hash liczy wewnątrz narzędzia.
8. Memory, storage i observability mogą istnieć w runtime Mastra, ale nie mogą stać się źródłem prawdy o planszy. Źródłem prawdy pozostają tylko payloady narzędzi.
9. Nie używać subagentów. Tu nie ma galaktyki; tu są trzy wiersze, dwanaście kolumn i dużo okazji do prostego błędu.
10. Nie opierać logiki na podglądzie `goingthere_preview`. Preview służy człowiekowi, nie jest źródłem prawdy dla programu.

### Known Gotchas

1. `verifyAnswer()` pakuje payload jako `{ task, apikey, answer }`, więc dla `start` i ruchów trzeba przekazać dokładnie `{ command: "..." }` jako `answer`.
2. Skaner częstotliwości nie zawsze zwraca parsowalny JSON, choć semantycznie może zawierać poprawne dane.
3. API może oddawać losowe błędy nawet dla dobrych żądań; brak retry oznacza rozwiązanie pozornie poprawne, lecz praktycznie kruche.
4. Agent musi sam parsować uszkodzone payloady skanera i wskazówek, bo narzędzia zwracają tylko surowy tekst.
5. W aktualnym kontrakcie narzędzia `frequency_scanner` agent przekazuje `detectionCode`, nie gotowy `disarmHash`.
6. Agent musi sprawdzać radar przed każdym ruchem, nie tylko na starcie.
7. Hints opisują skałę względem bieżącej pozycji rakiety, nie względem planszy absolutnej.

---

## 7. Acceptance Criteria

- [ ] Rozwiązanie działa jako agent Mastra zarejestrowany w `src/mastra/index.ts`
- [ ] Agent ma dokładnie cztery narzędzia domenowe: `start_game`, `frequency_scanner`, `get_radio_hint`, `move_rocket`
- [ ] `frequency_scanner` obsługuje tryby `listen` i `disarm`
- [ ] W trybie `disarm` agent przekazuje `frequency` i `detectionCode`, a hash wylicza narzędzie
- [ ] Agent sprawdza radar przed każdym ruchem
- [ ] Narzędzia zwracają surowe payloady bez lokalnego parsowania semantyki
- [ ] Agent interpretuje wskazówki radiowe i wybiera tylko ruchy bezpieczne oraz legalne
- [ ] Katastrofa skutkuje restartem gry, nie kontynuacją starego stanu
- [ ] Flaga jest przechwytywana programowo przez `verifyAnswer` / `captureFlag`
- [ ] Rozwiązanie buduje się poprawnie przez `npm run build` / `mastra build`
