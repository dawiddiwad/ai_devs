# Poszukiwania `domatowo`

## 1. Teleologia i perymetr operacji

### Ekstrakt z protokołu zadania

Oto bowiem Domatowo — aglomeracja-widmo, miasto, które de facto przestało istnieć w materialnym kontinuum, lecz jego cyfrowy powidok wciąż jeszcze o tym nie wie. Na ponurej, matematycznej siatce jedenastu na jedenaście urojonych pól, w trzewiach jednego z najwyższych monolitów, ukrywa się istota ludzka. My zaś — zbrojni w cybernetyczne transportery, zwiadowców i żałośnie skończony budżet punktów akcji (entropia wszak nieubłaganie rośnie) — musimy owego rozbitka odnaleźć i posłać poń śmigłowiec ratunkowy, zanim wyczerpie się nam zarówno czas, jak i kognitywna pojemność elektronowego mózgu (modelu językowego).

Maszyneria owa zdolna jest do pracy w dwóch stanach ontologicznych, o których decyduje przełącznik `USE_SUBAGENTS`. W **trybie roju (klastrowym)**, nadrzędny Orkiestrator niczym demiurg planuje, deleguje i koordynuje; powołuje do życia efemeryczne homunkulusy (agentów klastrowych), które realizują dyrektywy w całkowicie odizolowanych, dziewiczych bańkach świadomości. W **trybie monolitycznym**, Orkiestrator ów samotnie dźwiga ciężar planowania i egzekucji — brnąc iteracja po iteracji przez gąszcz prawdopodobieństw.

### Aksjomaty wejściowe

| Parametr Bytu       | Desygnat w kodzie                                     |
| ------------------- | ----------------------------------------------------- |
| Nomenklatura        | `domatowo`                                            |
| Węzeł weryfikacyjny | `config.verifyEndpoint` (`HUB_ENDPOINT + /verify`)    |
| Klucz dostępu (API) | `config.aiDevsApiKey`                                 |
| Punkt osobliwości   | akcja `help` — Orkiestrator uczy się świata ex nihilo |

### Pożądany ekstrakt finalny

Cenny artefakt pod postacią flagi `/\{FLG:.*?\}/`, wypluty w drgawkach odpowiedzi na komendę `callHelicopter`. Pochwycony przez bezlitosne sito wyrażeń regularnych w trzewiach `call-api.ts`, wyryty w logach, po czym następuje ostateczna eutanazja procesu: `process.exit(0)`.

---

## 2. Architektonika Cybernetyczna

### Tryb roju homunkulusów (`USE_SUBAGENTS=true`)

```text
index.ts
  └── runOrchestrator()   [MAX=40 myśli, substrat: ORCHESTRATOR_MODEL]
        ├── call_api("help")       → poznanie praw fizyki API
        ├── call_api("reset")      → powrót do tabula rasa
        ├── call_api("getMap")     → internalizacja przestrzeni 11×11
        ├── [proces myślowy: rozumnie (reasoning), bez interpretatora kodu]
        │     parcelacja na klastry → nawigacja BFS → kosztorys → wektor akcji
        └── spawn_cluster_agent({ plan: [{action,params},...], apiHelp })
              ↓ runClusterAgent()  [MAX=30 drgnięć, substrat: CLUSTER_AGENT_MODEL]
              ├── call_api(action_1) ... call_api(action_N)
              └── finish("found at XN" | "cluster clear")
```

### Tryb samotnego Mózgu (`USE_SUBAGENTS=false`)

```text
index.ts
  └── runOrchestrator()   [MAX=40 myśli]
        ├── call_api("help") → call_api("reset") → call_api("getMap")
        ├── [proces myślowy]
        └── paralelizacja wywołań call_api po rubieżach klastrów → call_api("getLogs")
```

### Higiena Epistemologiczna (Izolacja Kontekstu)

Zważmy na ów fundamentalny mechanizm kontroli zachłanności na tokeny: każde tchnienie wywołujące `runClusterAgent` preparuje **nową** instancję obiektu `OpenAI`, powołując do bytu nową, nieskalaną konwersację. Agenci klastrowi są niczym ślepcy — nie widzą wielkiego planu Orkiestratora, nie znają topografii mapy, nie wiedzą o istnieniu swych braci w innych klastrach. Ich egzystencja jest z góry skazana na 30 iteracji przy minimalnym narzucie wejścia/wyjścia. To piękny w swej prostocie kaganiec nałożony na entropię pamięci.

---

## 3. Iniekcje Behawioralne (Prompty)

### 3.1 Orkiestrator (`ORCHESTRATOR_SYSTEM_PROMPT`)

Jego dusza (prompt) kształtowana jest dynamicznie, a ostateczny krok (6) zależy od woli stwórcy (`config.useSubagents`):

```text
[Fundament wspólny]
1. Odkryj dostępne instrumenty (API).
2. Wymaż przeszłość (reset), po czym obejmij umysłem mapę.
3. Rób plany z rozwagą: klastry → ścieżki → rachunek kosztów → budżet < 300 pkt.
4. Zmaterializuj transportery jednym aktem woli.
5. Weryfikuj i koryguj kurs.

[Gdy USE_SUBAGENTS=true]  6. Przekaż każdy klaster podległym ci sub-golemom.
[Gdy USE_SUBAGENTS=false] 6. Dokonaj ruchu symultanicznie, badając logi po fakcie.
```

Brak tu ordynarnych, zaszytych na sztywno nazw narzędzi — Mózg sam dedukuje ich przeznaczenie na podstawie zarysów w schematach.

### 3.2 Agent Klastrowy (`CLUSTER_AGENT_SYSTEM_PROMPT`)

Sub-golem rodzi się z gotowym przeznaczeniem. Przyjmuje `planJson: string`, który wstrzykiwany jest prosto w jego systemowy rdzeń. Głos ludzki powiada mu tylko jedno: _„wykonaj podany plan, krok po kroku”_.

Matryca przeznaczenia wygląda następująco:

```json
[
	{ "action": "create", "params": "{\"type\":\"transporter\",\"passengers\":2}" },
	{ "action": "move", "params": "{\"where\":\"A6\"}" },
	{ "action": "inspect", "params": null },
	{ "action": "getLogs", "params": null }
]
```

Agent ten wyzbyty jest brzemienia wolnej woli. Nie planuje, nie medytuje nad mapą. Jest tępym, acz precyzyjnym egzekutorem, który jedynie wplata identyfikatory z API w narzucone z góry kroki.

---

## 4. Instrumentarium

### 4.1 Łącznik Bytu `call_api` (`src/tools/call-api.ts`)

Dany Orkiestratorowi oraz rzeszom agentów.

**Morfologia wejścia:**

```json
{
	"action": "string — nomenklatura aktu",
	"params": "string | null — zserializowany JSON z parametrami"
}
```

**Behawiorystyka:**

- Ciska POST `{ apikey, task, answer: { action, ...parsedParams } }` w stronę `config.verifyEndpoint`.
- `validateStatus: () => true` — filozoficzny stoicyzm, nigdy nie rzuca błędem, błędy stanowią wszakże cenną naukę.
- Przy każdym podsłuchanym słowie odpowiedzi, filtruje poszukując `/\{FLG:.*?\}/`. Jeśli anomalia zostanie wykryta: krzyczy `printSummary('FLAG CAPTURED')` i popełnia algorytmiczne samobójstwo `process.exit(0)`.
- Rejestruje kronikę w `stats.ts` poprzez `recordAction(action, failed)` i bada ubytek sił witalnych `updateActionPointsLeft(responseText)`.

---

### 4.2 Rozsiewacz `spawn_cluster_agent` (`src/tools/spawn-cluster-agent.ts`)

Zastrzeżone wyłącznie dla Orkiestratora (w trybie roju).

**Morfologia wejścia:**

```json
{
	"plan": "[{action, params}, ...]  — zwój rozkazów",
	"apiHelp": "string — surowy traktat 'help' z API, by sub-golem rozumiał komendy"
}
```

**Behawiorystyka:** Odpala instancję `runClusterAgent(...)` i po chłodnej kalkulacji zwraca werdykt. Zwraca `"found at XN"`, `"cluster clear"` lub też protokół porażki.

---

### 4.3 Przełącznik Zmierzchu `finish` (`src/tools/finish.ts`)

Narzędzie eschatologiczne, dane wyłącznie homunkulusom klastrowym.

Fabryka `createFinishTool(onFinish)` domyka się leksykalnie. Jej uderzenie ustawia `finalSummary`, co główny cykl `runAgentLoop` odczytuje jako zapowiedź końca (`shouldStop()`) i bezzwłocznie gasi świadomość agenta. Jeśli maszyna nazbyt zwleka, na ostatniej możliwej iteracji (`MAX_CLUSTER_ITERATIONS - 1`) zostaje wymuszony akt `tool_choice: { type: 'function', name: 'finish' }` — by zapobiec jałowemu mieleniu pustki.

---

## 5. Pętla Świadomości Algorytmicznej (`src/agent-loop.ts`)

Silnik napędzający tak Demiurga, jak i jego sługi. Sterowany matrycą `AgentLoopConfig`:

| Parametr Zbieżności   | Orkiestrator               | Agent klastrowy               |
| --------------------- | -------------------------- | ----------------------------- |
| `maxIterations`       | 40                         | 30                            |
| `model`               | `config.orchestratorModel` | `config.clusterAgentModel`    |
| `defaultToolChoice`   | `'required'`               | `'auto'`                      |
| `lastIterationTool`   | —                          | `'finish'`                    |
| `shouldStop`          | —                          | `() => finalSummary !== null` |
| `compactionThreshold` | 50 000                     | 50 000                        |
| `reasoningEffort`     | `'low'`                    | `'low'`                       |

Pętla owa mieli wiadomości (`message`), halucynacje narzędziowe (`function_call`) i ewentualne majaczenia interpretera kodu (`code_interpreter_call`).

---

## 6. Chronologia Aktu Wykonawczego

```text
INICJACJA ZAPŁONU
  ├─ 1. call_api("help")     → Wczytanie fizyki wszechświata API
  ├─ 2. call_api("reset")    → Wymazanie błędów przeszłości
  ├─ 3. call_api("getMap")   → Rozwinięcie płótna 11×11
  ├─ 4. [Proces myślowy z wykorzystaniem 'reasoning']
  │     Identyfikacja zgrupowań → nawigacja BFS → alokacja energii (budżet)
  ├─ 5. call_api("create")×N → Zbudowanie ciał (transporterów i zwiadowców)
  ├─ 6a. [Gdy USE_SUBAGENTS=true]
  │       spawn_cluster_agent(klaster_1) → "found at XN" | "cluster clear"
  │       spawn_cluster_agent(klaster_2) → ... (sekwencyjnie, dopóki brak zguby)
  │
  ├─ 6b. [Gdy USE_SUBAGENTS=false]
  │       call_api("move"), call_api("inspect"), call_api("getLogs") — burza równoległa
  │
  └─ 7. call_api("callHelicopter", {destination: "XN"})
         → FLAGA POCHWYCONA → proces wyparowuje (process.exit)
```

---

## 7. Rachunek Sumienia (`src/stats.ts`)

Księga główna pod postacią wzorca _singleton_. Zbiera do jednego tygla wszystkie akty poczynione w ramach tego samego procesu.
W trybie roju rozróżnia między wydatkami Orkiestratora a jego homunkulusów; w trybie monolitu — wskazuje po prostu sumę dla Mózgu. Z kurczącym się zapasem sił zderzamy się poprzez badanie pola `action_points_left`, skrzętnie odnajdywanego przez funkcję `findPointsInObject`.

---

## 8. Środowisko Zasilające i Zależności

### Ekstrakt zmiennych otoczenia

```env
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5-mini
ORCHESTRATOR_MODEL=          # Zwykle powiela OPENAI_MODEL
CLUSTER_AGENT_MODEL=         # Zwykle powiela OPENAI_MODEL
USE_SUBAGENTS=true           # Prawda = Rój, Fałsz = Monolit
OPENAI_TEMPERATURE=          # Ciepłota termodynamiczna myśli
AI_DEVS_API_KEY=
AI_DEVS_HUB_ENDPOINT=***hub_endpoint***
AI_DEVS_TASK_NAME=domatowo
```

### Anatomia cyfrowa

```text
src/
  index.ts                  — Przedsionek; tu budzi się Orkiestrator
  agent.ts                  — Konfiguracja umysłu nadrzędnego
  cluster-agent.ts          — Matryca powołująca homunkulusy z planem
  agent-loop.ts             — Pulsujące serce (pętla) dla obu bytów
  config.ts                 — Sznury wiążące z rzeczywistością (env)
  logger.ts                 — Narząd artykulacji zdarzeń (info, warn, error)
  prompts.ts                — Zbiornik duszy (prompty)
  stats.ts                  — Kronika wydatków energetycznych i punktowych
  tool-factory.ts           — Kuźnia interfejsów do świata zewnętrznego
  types.ts                  — Ontologia danych (code_interpreter ukryty w cieniu)
  tools/
    call-api.ts             — Miotacz zapytań i łowca Flagi
    spawn-cluster-agent.ts  — Generator bytów klastrowych
    finish.ts               — Narzędzie Eutanazji
```

---

## 9. Glosarium Osobliwości Implementacyjnych

1. **Pochwycenie Flagi** — rezyduje wyłącznie w jądrze `call-api.ts`. Golem nigdy nie wyartykułuje samej flagi. Przerwanie procesu wewnątrz narzędzia działa niczym zwarcie, omijając cały stos algorytmicznych rozważań — akt tak gwałtowny, jak i zamierzony.
2. **Dar Wszechwiedzy dla sub-agentów** — przekazując `apiHelp` wewnątrz `spawn_cluster_agent`, oszczędzamy homunkulusom mozolnego, filozoficznego dociekania "jak działa świat", wlewając tę wiedzę wprost do ich ograniczonej pamięci operacyjnej.
3. **Rygor `strict: true`** — parametry zredukowane zostały do `string | null`, by uniknąć zapętleń w zagnieżdżonych schematach maszynerii wymuszającej twardy reżim typowania.

---

## 10. Kryteria Akceptacji

- [ ] Inkantacja `npm run dev` kończy się ostatecznym tryumfem, bez konieczności interwencji biologicznego stwórcy.
- [ ] Zanim Orkiestrator tchnie życie w maszyny polowe, skrupulatnie bada świat przez `help` i zeruje przestrzeń przez `reset`.
- [ ] Przy wariancie roju (`USE_SUBAGENTS=true`), żaden agent nie dzieli konwersacyjnego strumienia świadomości ze swym bratem.
- [ ] Flaga jest łowiona bezlitosnym chwytem wewnątrz narzędzia `call-api.ts`, zanim zdąży zanieczyścić procesy myślowe modelu.
- [ ] Kronika `printSummary` wygłasza swą mowę pożegnalną zawsze, bez względu na sukces czy sromotną klęskę.
- [ ] Alchemia typów `npm run compile:check` nie zgłasza żadnych heretyckich odstępstw od normy.
