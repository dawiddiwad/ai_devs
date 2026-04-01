# Agent `domatowo`

## 1. Cel i zakres operacji

### Streszczenie zadania

Oto bowiem Domatowo — miasto, które przestało istnieć, lecz jeszcze o tym nie wie. Na jego siatce 11×11 pól ukrywa się człowiek w jednym z najwyższych bloków, a my — uzbrojeni w transportery, zwiadowców i skończony budżet punktów akcji — musimy go odnaleźć i wezwać śmigłowiec, zanim skończy nam się zarówno czas, jak i cierpliwość modelu językowego.

System działa w dwóch trybach, przełączanych zmienną `USE_SUBAGENTS`. W trybie agentów klastrowych orkiestrator planuje, deleguje i koordynuje; agenci klastrowi wykonują rozkazy w oddzielnych, świeżych kontekstach. W trybie jednolitym orkiestrator planuje i wykonuje sam — równolegle, iteracja za iteracją.

### Dane wejściowe

| Pole | Wartość |
|---|---|
| Nazwa zadania | `domatowo` |
| Endpoint weryfikacji | `config.verifyEndpoint` (`HUB_ENDPOINT + /verify`) |
| Klucz API | `config.aiDevsApiKey` |
| Punkt startowy | akcja `help` — orkiestrator odkrywa API autonomicznie |

### Produkt końcowy

Flaga `/\{FLG:.*?\}/` w odpowiedzi na `callHelicopter`. Przechwycona przez regex w `call-api.ts`, zalogowana, `process.exit(0)`.

---

## 2. Architektura

### Tryb agentów klastrowych (`USE_SUBAGENTS=true`)

```
index.ts
  └── runOrchestrator()   [MAX=40, model: ORCHESTRATOR_MODEL]
        ├── call_api("help")       → poznaj API
        ├── call_api("reset")      → czyste środowisko
        ├── call_api("getMap")     → mapa 11×11
        ├── [planowanie przez reasoning, bez code_interpreter]
        │     identyfikacja klastrów → trasy BFS → budżet → tablica akcji
        └── spawn_cluster_agent({ plan: [{action,params},...], apiHelp })
              ↓ runClusterAgent()  [MAX=30, model: CLUSTER_AGENT_MODEL]
              ├── call_api(action_1) ... call_api(action_N)
              └── finish("found at XN" | "cluster clear")
```

### Tryb jednolitego orkiestratora (`USE_SUBAGENTS=false`)

```
index.ts
  └── runOrchestrator()   [MAX=40]
        ├── call_api("help") → call_api("reset") → call_api("getMap")
        ├── [planowanie]
        └── call_api równolegle po wszystkich klastrach → call_api("getLogs")
```

### Kluczowe właściwości izolacji kontekstu

Każde wywołanie `runClusterAgent` tworzy **nowy** obiekt `OpenAI`, nową konwersację i niezależny stan historii. Agenci klastrowi nie widzą kontekstu orkiestratora — nie znają mapy, nie znają innych klastrów, nie znają historii wykonania. Ich kontekst jest z góry ograniczony do 30 iteracji × mały payload każdego żądania API. To jest fundamentalny mechanizm kontroli zużycia tokenów.

---

## 3. Prompty systemowe

### 3.1 Orkiestrator (`ORCHESTRATOR_SYSTEM_PROMPT`)

Dynamicznie generowany — końcowy krok (`6.`) zależy od `config.useSubagents`:

```
[wspólna część]
1. Discover the available API actions
2. Reset map state, then retrieve the map
3. Plan carefully: klastry → trasy → koszty → budżet < 300 pkt
4. Spawn transporters at once
5. Verify positions and recalculate

[USE_SUBAGENTS=true]  6. Delegate each cluster to a cluster agent
[USE_SUBAGENTS=false] 6. Execute all movements in parallel, check logs after
```

Brak jawnych nazw narzędzi — agent rozpoznaje je po opisach w schematach.

### 3.2 Agent klastrowy (`CLUSTER_AGENT_SYSTEM_PROMPT`)

Funkcja przyjmująca `planJson: string` i wstrzykująca go bezpośrednio do promptu systemowego. Plan staje się częścią systemu, a wiadomość użytkownika to tylko: _„execute all actions in the provided plan in sequence"_.

Format planu w prompcie:
```json
[{"action":"create","params":"{\"type\":\"transporter\",\"passengers\":2}"},
 {"action":"move","params":"{\"where\":\"A6\"}"},
 {"action":"inspect","params":null},
 {"action":"getLogs","params":null}]
```

Agent klastrowy nie planuje, nie analizuje mapy, nie podejmuje decyzji strategicznych. Wypełnia tylko identyfikatory obiektów z odpowiedzi API i wykonuje kolejne kroki.

---

## 4. Narzędzia

### 4.1 `call_api` (`src/tools/call-api.ts`)

Dostępne dla: orkiestratora i agenta klastrowego.

**Schemat wejściowy:**
```json
{
  "action": "string — nazwa akcji API",
  "params": "string | null — JSON-encoded params lub null"
}
```

**Zachowanie:**
- POST `{ apikey, task, answer: { action, ...parsedParams } }` do `config.verifyEndpoint`
- `validateStatus: () => true` — nigdy nie rzuca, błędy zawierają wskazówki
- Przy każdej odpowiedzi: sprawdza `/\{FLG:.*?\}/` → jeśli trafienie: `setFlag` + `printSummary('FLAG CAPTURED')` + `process.exit(0)`
- Zapisuje `recordAction(action, failed)` i `updateActionPointsLeft(responseText)` do `stats.ts`

**Zwraca:** surowy tekst odpowiedzi (JSON jako string).

---

### 4.2 `spawn_cluster_agent` (`src/tools/spawn-cluster-agent.ts`)

Dostępne dla: orkiestratora (tylko w trybie agentów klastrowych).

**Schemat wejściowy:**
```json
{
  "plan": "[{action, params}, ...]  — tablica akcji do wykonania",
  "apiHelp": "string — surowa odpowiedź akcji help, dla kontekstu API"
}
```

**Zachowanie:** Wywołuje `runClusterAgent(JSON.stringify({ plan, apiHelp }))` — zwraca wynik jako string.

**Zwraca:** `"found at XN"` | `"cluster clear"` | opis błędu.

---

### 4.3 `finish` (`src/tools/finish.ts`)

Dostępne dla: agenta klastrowego (wyłącznie).

Fabryka `createFinishTool(onFinish)` tworzy narzędzie przez leksykalne zamknięcie. Po wywołaniu ustawia `finalSummary` — pętla `runAgentLoop` wykrywa to przez `shouldStop()` i natychmiast zwraca.

Na ostatniej iteracji (`MAX_CLUSTER_ITERATIONS - 1`) wymuszany jest `tool_choice: { type: 'function', name: 'finish' }` — gwarantuje zakończenie zamiast marnowania iteracji.

---

## 5. Pętla agenta (`src/agent-loop.ts`)

Współdzielona przez orkiestratora i agenta klastrowego. Parametryzowana przez `AgentLoopConfig`:

| Parametr | Orkiestrator | Agent klastrowy |
|---|---|---|
| `maxIterations` | 40 | 30 |
| `model` | `config.orchestratorModel` | `config.clusterAgentModel` |
| `defaultToolChoice` | `'required'` | `'auto'` |
| `lastIterationTool` | — | `'finish'` |
| `shouldStop` | — | `() => finalSummary !== null` |
| `compactionThreshold` | 50 000 | 50 000 |
| `reasoningEffort` | `'low'` | `'low'` |

Pętla obsługuje trzy typy elementów odpowiedzi: `message`, `function_call`, `code_interpreter_call` (tylko logowanie — brak jawnego dispatchu, API obsługuje CI natywnie).

---

## 6. Przebieg wykonania

```
START
  ├─ 1. call_api("help")     → API docs
  ├─ 2. call_api("reset")    → czyste środowisko
  ├─ 3. call_api("getMap")   → mapa 11×11
  ├─ 4. [planowanie przez reasoning]
  │     identyfikacja klastrów → trasy BFS → budżet per klaster
  ├─ 5. call_api("create")×N → transportery + zwiadowcy
  ├─ 6a. [USE_SUBAGENTS=true]
  │       spawn_cluster_agent(klaster_1) → "found at XN" | "cluster clear"
  │       spawn_cluster_agent(klaster_2) → ... (tylko jeśli poprzedni: clear)
  │
  ├─ 6b. [USE_SUBAGENTS=false]
  │       call_api("move"), call_api("inspect"), call_api("getLogs") — równolegle
  │
  └─ 7. call_api("callHelicopter", {destination: "XN"})
         → FLAG CAPTURED → process.exit(0)
```

---

## 7. Statystyki (`src/stats.ts`)

Moduł-singleton. Agreguje dane ze wszystkich agentów w tym samym procesie (klastry działają in-process, nie jako podprocesy).

Tabela podsumowań dostosowuje się do trybu:
- `USE_SUBAGENTS=true` → wyświetla `Orchestrator` + `Subagent` modele
- `USE_SUBAGENTS=false` → wyświetla `Model`

Klucz `action_points_left` (snake_case) obsługiwany przez `findPointsInObject` — potwierdzone z logów API (`"action_points_left": 242`).

---

## 8. Zależności i środowisko

### Zmienne środowiskowe

```env
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5-mini
ORCHESTRATOR_MODEL=          # domyślnie: OPENAI_MODEL
CLUSTER_AGENT_MODEL=         # domyślnie: OPENAI_MODEL
USE_SUBAGENTS=true           # false = tryb jednolity
OPENAI_TEMPERATURE=          # opcjonalnie
AI_DEVS_API_KEY=
AI_DEVS_HUB_ENDPOINT=***hub_endpoint***
AI_DEVS_TASK_NAME=domatowo
```

### Struktura projektu

```
src/
  index.ts                  — wejście; wywołuje runOrchestrator()
  agent.ts                  — runOrchestrator(); konfiguracja pętli orkiestratora
  cluster-agent.ts          — runClusterAgent(plan); konfiguracja pętli klastrowej
  agent-loop.ts             — runAgentLoop(cfg); współdzielona pętla agenta
  config.ts                 — requireEnv(); orchestratorModel, clusterAgentModel, useSubagents
  logger.ts                 — kategorie: agent, tool, api; poziomy: info, warn, error, debug
  prompts.ts                — ORCHESTRATOR_SYSTEM_PROMPT (dynamiczny), CLUSTER_AGENT_SYSTEM_PROMPT(plan)
  stats.ts                  — singleton; recordAction, updateActionPointsLeft, printSummary
  tool-factory.ts           — defineAgentTool(); AgentTool interface
  types.ts                  — agentTools[], toolDefinitions (code_interpreter zakomentowany)
  tools/
    call-api.ts             — call_api; przechwytywanie flagi; stats
    spawn-cluster-agent.ts  — spawn_cluster_agent; wrapper runClusterAgent
    finish.ts               — createFinishTool(onFinish); fabryka narzędzia zakończenia
```

---

## 9. Kluczowe uwagi implementacyjne

1. **`code_interpreter` wykomentowany** — orkiestrator planuje przez reasoning (bez CI). Można przywrócić odkomentowując w `types.ts` i dodając do `toolDefinitions`.

2. **Izolacja kontekstu** — każdy `runClusterAgent` tworzy nowy `OpenAI` + nową konwersację. Brak `trimGetLogs` ani innych haków na strukturę odpowiedzi — izolacja wynika z architektury, nie z parsowania.

3. **Przechwytywanie flagi** — wyłącznie w `call-api.ts`, przy każdym wywołaniu. `process.exit(0)` wywołuje się z wnętrza narzędzia — omija resztę stosu wywołań, w tym `runClusterAgent` i `runOrchestrator`. Zamierzone zachowanie.

4. **`spawn_cluster_agent` przyjmuje `apiHelp`** — surowy tekst odpowiedzi `help` jest przekazywany do agenta klastrowego, aby znał pełne API bez potrzeby jego samodzielnego odkrywania (oszczędność iteracji).

5. **`strict: true` na `call_api` i `spawn_cluster_agent`** — wymaga dokładnego dopasowania schematu; `params` jest `string | null` (nie obiekt), aby uniknąć problemów ze strict mode i zagnieżdżonymi schematami.

---

## 10. Kryteria akceptacji

- [ ] `npm run dev` kończy działanie bez interwencji człowieka
- [ ] Orkiestrator wywołuje `help` i `reset` przed jakąkolwiek operacją polową
- [ ] W trybie `USE_SUBAGENTS=true`: każdy klaster uruchamiany w oddzielnej konwersacji
- [ ] Flaga przechwycona przez regex w `call-api.ts` — nigdy przez LLM
- [ ] `printSummary` wywoływane przy każdym zakończeniu (sukces i niepowodzenie)
- [ ] `npm run compile:check` przechodzi czysto
