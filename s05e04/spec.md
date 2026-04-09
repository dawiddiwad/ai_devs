# Rakieta Pośród Zakłóceń `goingthere`

## 1. Overview & Goal

### Task Summary

Trzeba powołać do istnienia Agenta-Nawigatora, istotę o ograniczonej, lecz dostatecznej przenikliwości, która przeprowadzi rakietę naziemną przez pas pustkowia ku Grudziądzowi. Świat ten jest mały, ale złośliwy: skały stoją na torze lotu, radio kłamie półgębkiem, a system OKO co pewien czas próbuje zamienić podróżnika w krótki błysk i jeszcze krótszy nekrolog.

Agent nie ma rozwiązać problemu przez brutalną siłę kodu ukrytego poza jego świadomością. Ma działać jak prawdziwy pilot narzędziowy: rozpoczynać grę, przed każdym ruchem sprawdzać namierzenie, w razie potrzeby rozbrajać radar, słuchać radiowej wskazówki o skale w następnej kolumnie i wybrać właściwy ruch, aż do dotarcia do bazy.

Odporność na entropię musi jednak tkwić nie w poezji promptu, lecz w instrumentach:

- losowe błędy API muszą być ponawiane automatycznie
- losowe błędy API muszą być ponawiane automatycznie
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
You are a cautious rocket navigator operating on a 3x12 grid.

Your job is to reach Grudziadz without crashing into rocks and without being shot down by the OKO radar system.

## World Rules

- You start at row 2, column 1.
- The target is always in column 12, in the target row returned after `start_game`.
- Allowed movement commands:
  - `go` -> same row, next column
  - `left` -> row - 1, next column
  - `right` -> row + 1, next column
- `left` is invalid from row 1.
- `right` is invalid from row 3.
- Hitting a rock crashes the rocket.
- Moving out of bounds crashes the rocket.
- Before every move, you must call `frequency_scanner` with action `listen`.
- After the path is clear, call `get_radio_hint`.
- The hint describes where the rock is in the next column relative to the rocket.

## Hint Interpretation

Map the rock position to the blocked command:

- ahead, front, straight ahead, forward, bow, fore -> `go` is blocked
- left, port -> `left` is blocked
- right, starboard -> `right` is blocked

## Workflow

1. Call `start_game`.
2. Parse the raw tool response to determine current row, column, and target row.
3. Before every move, call `frequency_scanner` with action `listen`, `frequency = null`, and `disarmHash = null`.
4. Then call `get_radio_hint`.
5. Parse the raw scanner payload yourself.
6. If the scanner says the path is not clear, extract `frequency` and `detectionCode`, compute `SHA1(detectionCode + "disarm")`, then call `frequency_scanner` with action `disarm`.
7. Infer which command is blocked by the rock.
8. Choose a valid safe move:
   - never choose a blocked move
   - never choose a move that leaves the grid
   - if multiple safe moves exist, prefer the one that moves closer to the target row
   - if already aligned with the target row and `go` is safe, prefer `go`
9. Call `move_rocket`.
10. If the rocket crashes or the game resets, call `start_game` again and continue from the new state.
11. Stop only when the flag is captured.

## Rules

- Never move before calling `frequency_scanner` with action `listen`, `frequency = null`, and `disarmHash = null`.
- Treat tool outputs as the only source of truth.
- Do not invent coordinates or radar state.
- If a tool returns a transient failure, call the tool again.
- Keep going until the flag is captured.
- Tools return raw payloads. You must parse them yourself.
```

### User Prompt

```markdown
Start the game, survive every column, and reach the target base in Grudziadz.
Use the tools carefully and do not skip the radar check before any move.
```

---

## 3. Tool Definitions

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
		"disarmHash": {
			"type": ["string", "null"]
		}
	},
	"required": ["action", "frequency", "disarmHash"],
	"additionalProperties": false
}
```

**Behavior:**

- dla `action = "listen"` oczekuje `frequency = null` i `disarmHash = null`, po czym wykonuje GET przez `axios` do `frequencyScanner`
- dla `action = "disarm"` wykonuje POST przez `axios` do `frequencyScanner` z `frequency` i `disarmHash`
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
  │      └─ jeśli nie jest clear -> agent wydobywa frequency + detectionCode -> liczy SHA1 -> frequency_scanner({ action: "disarm", ... })
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

### package.json additions

| Package | Purpose                                             |
| ------- | --------------------------------------------------- |
| `axios` | wywołania HTTP do `getmessage` i `frequencyScanner` |

### Environment Variables

```env
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.4-nano
AI_DEVS_API_KEY=
AI_DEVS_TASK_NAME=goingthere
AI_DEVS_HUB_ENDPOINT=***hub_endpoint***
```

### Project Structure

```text
src/
  index.ts                     # Thin entry using runAgent()
  prompts.ts                   # System/user prompts
  tools/
    index.ts                   # Tool registry
    start-game.ts              # POST start to verify endpoint
    frequency-scanner.ts       # scanner listen/disarm + retry
    get-radio-hint.ts          # getmessage wrapper with retry
    move-rocket.ts             # go/left/right via verify endpoint
  utils/
    retry.ts                   # bounded retry with short backoff
```

---

## 6. Key Implementation Notes

1. Użyć `runAgent(config, { api: 'responses', ... })`, bo zadanie jest tekstowe i narzędziowe.
2. Ustawić `toolChoice: 'required'`, aby agent nie popadał w jałową narrację.
3. Dodać `handleNoToolCalls`, które przypomni agentowi, by kontynuował pracę narzędziami aż do przechwycenia flagi.
4. `maxIterations` ustawić wyżej niż domyślne minimum, np. `40`, bo pełne przejście może wymagać wielu tur.
5. Retry musi żyć w kodzie narzędzi, nie w modelu. Zalecany budżet: 5 prób z krótkim backoffem.
6. Wszystkie wywołania HTTP poza `verifyAnswer` prowadzić przez `axios`, zgodnie z praktyką reszty monorepo.
7. Narzędzia nie powinny parsować treści odpowiedzi. Mają zwracać surowy payload, a cała interpretacja należy do LLM.
8. `frequency_scanner` ma mieć dwa tryby: `listen` i `disarm`.
9. Nie używać subagentów. Tu nie ma galaktyki; tu są trzy wiersze, dwanaście kolumn i dużo okazji do prostego błędu.
10. Nie opierać logiki na podglądzie `goingthere_preview`. Preview służy człowiekowi, nie jest źródłem prawdy dla programu.

### Known Gotchas

1. `verifyAnswer()` pakuje payload jako `{ task, apikey, answer }`, więc dla `start` i ruchów trzeba przekazać dokładnie `{ command: "..." }` jako `answer`.
2. Skaner częstotliwości nie zawsze zwraca parsowalny JSON, choć semantycznie może zawierać poprawne dane.
3. API może oddawać losowe błędy nawet dla dobrych żądań; brak retry oznacza rozwiązanie pozornie poprawne, lecz praktycznie kruche.
4. Agent musi sam parsować uszkodzone payloady skanera i wskazówek, bo narzędzia zwracają tylko surowy tekst.
5. Agent musi sprawdzać radar przed każdym ruchem, nie tylko na starcie.
6. Hints opisują skałę względem bieżącej pozycji rakiety, nie względem planszy absolutnej.

---

## 7. Acceptance Criteria

- [ ] Agent działa przez `responses`
- [ ] Agent ma dokładnie cztery narzędzia domenowe: `start_game`, `frequency_scanner`, `get_radio_hint`, `move_rocket`
- [ ] `frequency_scanner` obsługuje tryby `listen` i `disarm`
- [ ] Agent sprawdza radar przed każdym ruchem
- [ ] Narzędzia zwracają surowe payloady bez lokalnego parsowania semantyki
- [ ] Agent interpretuje wskazówki radiowe i wybiera tylko ruchy bezpieczne oraz legalne
- [ ] Katastrofa skutkuje restartem gry, nie kontynuacją starego stanu
- [ ] Flaga jest przechwytywana programowo przez `verifyAnswer` / `captureFlag`
- [ ] Rozwiązanie buduje się poprawnie przez `npm run build`
