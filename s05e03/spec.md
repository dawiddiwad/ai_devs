# Archiwista Pustkowia `shellaccess`

## 1. Overview & Goal

### Task Summary

Należy powołać do krótkiego, lecz użytecznego istnienia Agenta, który nie błądzi w metaforach bardziej niż to konieczne, tylko cierpliwie przesiewa popiół danych. Jego zadaniem jest penetrowanie zdalnego serwera za pomocą poleceń powłoki, odczytanie archiwum ukrytego w `/data` i wydobycie z niego czterech konkretów, bez których cała wyprawa w czasie byłaby jedynie źle opowiedzianą bajką technologiczną.

Agent musi ustalić:

- datę odnalezienia Rafała
- miasto odnalezienia
- długość geograficzną miejsca
- szerokość geograficzną miejsca

Na tym jednak tkwi drobna złośliwość zadania: w odpowiedzi nie wolno zwrócić dnia odnalezienia, lecz dzień go poprzedzający.

### Hardcoded Inputs / Initial Data

| Field               | Value                              |
| ------------------- | ---------------------------------- |
| task                | `shellaccess`                      |
| endpoint            | `HUB_ENDPOINT/verify`              |
| apikey              | `AI_DEVS_API_KEY`                  |
| remote data path    | `/data`                            |
| remote capabilities | standard Linux tools, `grep`, `jq` |
| final output mode   | shell command printing JSON        |

### Final Deliverable

Flaga zwrócona przez Hub po wykonaniu takiego polecenia `cmd`, które na zdalnym serwerze wypisze wyłącznie JSON w formacie:

```json
{
	"date": "YYYY-MM-DD",
	"city": "miasto",
	"longitude": 10.000001,
	"latitude": 12.345678
}
```

Pole `date` musi oznaczać dzień przed odnalezieniem Rafała.

---

## 2. Agent Persona & Prompt Strategy

### System Prompt

```markdown
You are a precise command-line investigator.

Your only way to interact with the task environment is the `run_remote_command` tool.
Each tool call sends one shell command to the remote server through the hub.

## Goal

Find:

1. the date when Rafał was found
2. the city where this happened
3. the longitude
4. the latitude

Then return the previous day as `date` and produce one final shell command that prints valid JSON only.

## Workflow

1. Inspect `/data` first.
2. Narrow the search with targeted commands.
3. Extract the exact discovery date, city, longitude, and latitude.
4. Convert the discovery date to one day earlier.
5. Execute one final command that prints only the required JSON.

## Rules

- Use absolute paths.
- Assume commands are stateless between calls.
- Prefer `ls`, `grep`, `jq`, `file`, `sort`, `uniq`, `cut`.
- Avoid dumping huge files unless necessary.
- Do not use destructive commands.
- Do not modify remote files.
- Before the final step, stay read-only.
- The final command must print JSON only, with no commentary.
- Prefer `jq -n` for the final JSON to avoid quoting mistakes.
- If data conflicts, gather more evidence before the final command.
- Remember: returned `date` must be one day before Rafał was found.
```

### User Prompt

```markdown
Search the remote archive in `/data`, identify the required facts, and finish by executing the single final command that prints the answer JSON.
```

---

## 3. Tool Definitions

### 3.1 `run_remote_command`

**Description:** Wysyła pojedyncze polecenie powłoki do zdalnego serwera przez Hub i zwraca surową odpowiedź tekstową.

**Input Schema:**

```json
{
	"type": "object",
	"properties": {
		"cmd": {
			"type": "string",
			"description": "A single shell command to execute on the remote server"
		}
	},
	"required": ["cmd"],
	"additionalProperties": false
}
```

**Behavior:**

- wywołuje `verifyAnswer(config, { cmd })`
- zwraca tekst odpowiedzi z Hubu
- służy zarówno do eksploracji `/data`, jak i do finałowego polecenia
- pozwala przechwycić flagę przez standardowy mechanizm `captureFlag`

**Returns:**

- tekst odpowiedzi z Hubu
- ewentualną flagę, jeśli końcowe polecenie okaże się prawdziwe

---

## 4. Execution Flow

```text
START
  ├─ 1. run_remote_command("ls -la /data")
  ├─ 2. Rozpoznanie struktury archiwum
  ├─ 3. Zawężanie obszaru poszukiwań przez grep/jq/file
  ├─ 4. Ustalenie:
  │      ├─ discoveryDate
  │      ├─ city
  │      ├─ longitude
  │      └─ latitude
  ├─ 5. Obliczenie previousDate = discoveryDate - 1 day
  ├─ 6. Final command:
  │      └─ wypisz wyłącznie JSON, najlepiej przez jq -n
  └─ END
```

### Key Decision Points

1. Jeśli `/data` zawiera wiele plików, agent najpierw mapuje strukturę, a dopiero potem czyta konkretne źródła.
2. Jeśli logi są obszerne, agent używa wyszukiwania po słowach kluczowych zamiast pełnego zrzutu treści.
3. Jeśli data, miasto lub współrzędne występują w kilku wariantach, agent wybiera źródło najbardziej jawne i jednoznaczne.
4. Jeśli polecenie zwraca zbyt wiele szumu, agent zawęża filtr zamiast mnożyć chaos.
5. Finalne polecenie musi być samowystarczalne i nie może zakładać zachowania stanu między wywołaniami.

---

## 5. Dependencies & Environment

### package.json additions

| Package | Purpose                         |
| ------- | ------------------------------- |
| none    | obecny stack jest wystarczający |

### Environment Variables

```env
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5-mini
AI_DEVS_API_KEY=
AI_DEVS_TASK_NAME=shellaccess
AI_DEVS_HUB_ENDPOINT=***hub_endpoint***
```

### Project Structure

```text
src/
  index.ts                  # Thin entry using runAgent()
  prompts.ts                # System/user prompts
  tools/
    index.ts                # Tool registry
    run-remote-command.ts   # Single tool for remote shell execution
```

---

## 6. Key Implementation Notes

1. Użyć `api: 'responses'`, ponieważ zadanie jest czysto tekstowe i nie wymaga cięższej orkiestracji.
2. Zastąpić generyczne `verify_answer` narzędziem domenowym `run_remote_command`.
3. Dodać `handleNoToolCalls`, które przypomni agentowi o dalszym używaniu narzędzia aż do pozyskania flagi.
4. Nie budować lokalnego parsera archiwum, jeśli zwykłe polecenia powłoki wystarczą do dojścia do prawdy.
5. Finalny JSON najlepiej generować przez `jq -n`, aby uniknąć błędów cytowania.
6. W promptcie jasno zakazać komend destrukcyjnych oraz modyfikacji plików na zdalnym serwerze.
7. Traktować odpowiedź Huba jako jedyne źródło obserwacji świata zdalnego.

### Known Gotchas

1. Hub nie oczekuje bezpośrednio obiektu `{ date, city, longitude, latitude }`, tylko obiektu `{ cmd }`.
2. Zwracana data nie jest datą odnalezienia, lecz dniem wcześniejszym.
3. Polecenia powinny używać ścieżek absolutnych, bo zdalna sesja może nie zachowywać bieżącego katalogu.
4. Nie należy komplikować architektury: jedna pętla, jedno narzędzie, jedna odpowiedzialność.
5. `grep` i `jq` są wskazanymi przez zadanie instrumentami, więc warto oprzeć na nich główną strategię.

---

## 7. Acceptance Criteria

- [ ] Agent działa przez `responses`
- [ ] Agent ma jedno narzędzie domenowe: `run_remote_command`
- [ ] Agent eksploruje `/data` wyłącznie komendami read-only aż do finału
- [ ] Finalne polecenie wypisuje poprawny JSON i nic więcej
- [ ] `date` jest obliczona jako dzień przed odnalezieniem Rafała
- [ ] Flaga jest przechwytywana programowo przez `captureFlag` lub `verifyAnswer`
- [ ] Rozwiązanie buduje się poprawnie przez `npm run build`
