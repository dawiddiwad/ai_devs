# Chronometraż cybernetycznego aeromotoru `windpower`

## 1. O naturze przedsięwzięcia

### Teza zasadnicza

Zważmy na ów aeromotor, zwaną pospolicie turbiną wiatrową – maszynerię tyleż potężną, co kapryśną, której przyrodzonym celem jest transmutacja eolskich podmuchów w szlachetny strumień elektronów, a w przypadku nadmiaru atmosferycznego entuzjazmu – w spektakularną dezintegrację własnej konstrukcji. Zadanie, jawiące się umysłom naiwnym jako trywialne, polega na wytyczeniu takiego algorytmu jej pracy, by zadośćuczynić deficytom energetycznym wszechświata, nie doprowadzając wszakże wirnika do stanu bezłopatkowego kalectwa.

Całej tej karkołomnej ekwilibrystyki dokonać należy w mgnieniu oka – w sekundach `40` zaledwie! Albowiem Demiurgowie nadzorujący ów serwer uchylają lufcik serwisowy na czas tak mikroskopijny, jak gdyby z góry zakładali u inżynierów po drugiej stronie kabla wrodzoną niekompetencję tudzież skłonność do sabotażu (co, nawiasem mówiąc, jest na ogół założeniem wysoce roztropnym).

Interfejs ów, z angielska `API` zwany, cierpi na asynchroniczność właściwą systemom projektowanym przez niepoprawnych optymistów: wrzucasz zadania w cyfrową otchłań i żywisz płonną nadzieję, że echa ich wykonania rychło do ciebie powrócą. Zaniechawszy rytuału `Promise.all`, stoczysz się w przepaść limitów czasowych. Zignorowawszy funkcję `getResult`, pozostaniesz w gnoseologicznym mroku, nie wiedząc o losie turbiny zgoła nic. Bez Flagi zaś – nie ma triumfu, jest tylko algorytmiczny niebyt.

### Znane dane wejściowe

| Pole            | Wartość                       |
| --------------- | ----------------------------- |
| task            | `windpower`                   |
| verify endpoint | `AI_DEVS_HUB_ENDPOINT/verify` |

### Spodziewana nagroda

Zapłata za ten trud tytaniczny przyjmuje postać Flagi, zakodowanej w formule `{FLG:...}`. Należy ją wydłubać z trzewi ostatecznej odpowiedzi (występującej pod kryptonimem `done`) za pomocą skromnego, acz rygorystycznego wyrażenia regularnego. Biada temu, kto powierzyłby tę delikatną operację syntaktyczną modelowi językowemu! Ten cyfrowy polimata, skłonny do halucynacji i swobodnej konfabulacji, gotów byłby uznać Flagę za byt zgoła prozaiczny i w jej miejsce zaoferować nam sonet o wiośnie na Marsie.

---

## 2. Filozofia architektury

W prapoczątkach dzieła umysł mój skłaniał się ku skryptom proceduralnym – tworom o determinizmie żelaznym, zimnym i nieugiętym niczym logika Boole'a. Prędko atoli empiria wykazała, iż ów zewnętrzny Interfejs przepoczwarza się z szybkością przewyższającą tempo ewolucji biologicznej, a każda nieznaczna mutacja nazwy parametru obraca misterny kod w bezużyteczny zabytek paleocybernetyki.

Przeto zaniechałem proceduralnego dogmatyzmu na rzecz syntetycznego CEREBRATORA (Agenta Rozumującego). Ów model językowy, niby elektronowy gnostyk, sam pochłania księgi dokumentacji API w czasie rzeczywistym, samodzielnie dedukuje co, w jakiej kolejności i z jakim impetem wywołać, podczas gdy wbudowane narzędzia stanowią jedynie pokorne przedłużenie jego cyfrowej woli.

```
src/
  index.ts        ← punkt wejścia: start → help → oddaj pałeczkę agentowi
  agent.ts        ← pętla agenta; równoległość przez Promise.all
  api.ts          ← klient API z globalną pulą wyników (resultPool)
  prompts.ts      ← SYSTEM_PROMPT(helpDocs) + USER_PROMPT
  config.ts       ← zmienne środowiskowe przez requireEnv()
  logger.ts       ← trzy kategorie × cztery poziomy logowania
  types.ts        ← rejestr jedynego narzędzia
  tool-factory.ts ← defineAgentTool() — fabryka narzędzi
  tools/
    call-api.ts   ← jedyne narzędzie: call_api(action, params?)
```

---

## 3. O klientach i kolejkach (`api.ts`)

Każde żądanie do systemu przybiera formę rytuału:

```json
{
  "apikey": "...",
  "task": "windpower",
  "answer": { "action": "...", ...params }
}
```

### Katalog akcji

| Akcja                 | Natura | Przeznaczenie                                            |
| --------------------- | ------ | -------------------------------------------------------- |
| `help`                | sync   | Objawia dostępne akcje i ich wymagane parametry          |
| `start`               | sync   | Otwiera okno serwisowe — klepsydra zaczyna sypać         |
| `get`                 | async  | Pobiera dane pod wskazanym param (weather, turbinecheck) |
| `getResult`           | sync   | Wyciąga kolejny wynik z globalnej kolejki                |
| `unlockCodeGenerator` | async  | Generuje kryptograficzny podpis punktu konfiguracji      |
| `config`              | sync   | Przesyła kompletną konfigurację turbiny                  |
| `done`                | sync   | Finalizacja — źródło flagi                               |

> Nazwy dostępnych paramów do `get` poznaje się wyłącznie z odpowiedzi `help`.
> Przed jej odczytaniem nie wiemy nic. Jest to stan epistemologicznie uczciwy.

### Globalna kolejka i pula wyników

API nie zna pojęcia `jobId`. Wyniki spływają do **jednej globalnej kolejki**, z której `getResult`
pobiera je po kolei — bez gwarancji kolejności, bez numeru seryjnego. W obliczu tej anarchii
system stosuje `resultPool`: wyniki skonsumowane, lecz nieodebrane przez bieżącego konsumenta,
odkładane są do puli, skąd inni konsumenci mogą je podjąć. `collectMatchingResult(predicate)`
sprawdza pulę, zanim sięgnie po nowy wynik z kolejki.

### Kody odpowiedzi

| Kod | Znaczenie                           |
| --- | ----------------------------------- |
| 11  | Kolejka pusta — przyjdź później     |
| 14  | Zadanie przyjęte do kolejki (async) |
| 21  | Zadanie przyjęte do kolejki (async) |
| 31  | Zadanie przyjęte do kolejki (async) |
| 41  | Zadanie przyjęte do kolejki (async) |

`isQueueConfirmation(response)` wykrywa kody 14/21/31/41 i rozstrzyga: czekać czy zwrócić od razu.

---

## 4. Jedyne narzędzie wszechrzeczy (`tools/call-api.ts`)

Tam gdzie niegdyś istniały cztery specjalizowane narzędzia — `fetch_turbine_data`,
`generate_unlock_code`, `submit_config`, `call_done` — dziś stoi jedno:

```ts
call_api(action: string, params: string | null)
```

- `action` — nazwa akcji z dokumentacji API
- `params` — parametry zakodowane jako ciąg JSON, lub `null` gdy akcja ich nie potrzebuje

**Routing odpowiedzi asynchronicznych:**

Jeśli odpowiedź to potwierdzenie kolejkowania (`isQueueConfirmation`), narzędzie nie wraca
— czeka na właściwy wynik przez `collectMatchingResult`:

- Akcja `unlockCodeGenerator`: dopasowanie po `signedParams.startDate + startHour`
- Pozostałe akcje async (`get`): dopasowanie po `sourceFunction === params.param ?? action`
- Akcje synchroniczne (`config`, `done` i inne): wynik zwracany natychmiast

**Dlaczego jedno narzędzie?**

Model językowy dysponuje dokumentacją API wstrzykniętą do kontekstu. Sam wie, jakie akcje
wywołać i w jakiej kolejności. Kodowanie tej wiedzy w osobnych narzędziach byłoby redundancją
godną pożałowania — enkapsulacją dla samej enkapsulacji. Jedno generyczne narzędzie jest
uczciwe wobec ontologii systemu.

**Subtelność schematu Zod:**

`params` jest zadeklarowane jako `z.string().nullable()` — **nie** jako `.optional()`.
OpenAI strict mode wymaga, by każda właściwość figurowała w tablicy `required`.
Pole opcjonalne wymykałoby się temu wymaganiu i API odrzuciłoby schemat z pogardą.
Pole nullable jest obecne w `required`, lecz może przyjmować wartość `null` — kompromis
między prawem a wolnością.

---

## 5. Pętla agenta (`agent.ts`)

```
PĘTLA (max 10 iteracji)
  │
  ├─ Iteracja 1 — Poznanie:
  │    LLM odczytuje helpDocs i wywołuje call_api równolegle dla
  │    wszystkich dostępnych paramów: "weather", "turbinecheck",
  │    "powerplantcheck" (async) oraz "documentation" (sync — natychmiastowy)
  │
  ├─ Iteracja 2 — Rozumowanie i podpisywanie:
  │    LLM analizuje dane: identyfikuje okresy wichury, wyznacza
  │    optymalny slot produkcji, wywołuje unlockCodeGenerator
  │    dla WSZYSTKICH punktów konfiguracji równolegle
  │
  ├─ Iteracja 3 — Konfiguracja:
  │    call_api action="config" z kompletną mapą konfiguracji
  │
  └─ Iteracja 4 — Finalizacja:
       call_api action="done" → FLAG_REGEX → process.exit(0)
```

Wszystkie `function_call` z jednej odpowiedzi LLM wykonują się przez `Promise.all` —
jest to kluczowa właściwość systemu, bez której 40 sekund nie wystarczy.

---

## 6. Prompt systemowy (`prompts.ts`)

`SYSTEM_PROMPT(helpDocs)` wstrzykuje odpowiedź `help` jako JSON — model widzi pełną
dokumentację API jeszcze zanim zacznie działać.

Instrukcje dla modelu:

1. Wywołaj `call_api` dla WSZYSTKICH paramów danych równolegle (w tym `documentation`)
2. Zidentyfikuj okresy wichury i optymalny slot produkcji z danych turbiny
3. Wywołaj `unlockCodeGenerator` dla WSZYSTKICH punktów konfiguracji równolegle
4. Wyślij `config` z pełną mapą konfiguracji
5. Wywołaj `done`

Reguły fizyczne zakodowane w prompcie:

- Wichura = wiatr powyżej maksimum z dokumentacji → `pitchAngle=90`, `turbineMode=idle`
- Produkcja: najlepszy bezpieczny slot pokrywający deficyt energii → `turbineMode=production`
- Format datetime: `"YYYY-MM-DD HH:00:00"` — minuty i sekundy zawsze równe zeru

---

## 7. Punkt wejścia (`index.ts`)

```ts
callApi('start') // otwiera okno serwisowe — klepsydra rusza
helpDocs = callApi('help') // jedyna znana akcja a priori
runAgent(helpDocs) // dalej decyduje model
```

Przed `help` nie wiemy nic o API. To jedyna intelektualnie uczciwa pozycja startowa.

---

## 8. Przechwytywanie flagi

Flaga przechwytywana **wyłącznie przez wyrażenie regularne** w `callApi` — nigdy przez LLM,
który mógłby uznać ją za początek interesującej rozmowy:

```ts
const FLAG_REGEX = /\{FLG:.*?\}/
const flagMatch = text.match(FLAG_REGEX)
if (flagMatch) {
	logger.agent('info', `FLAG CAPTURED: ${flagMatch[0]}`)
	process.exit(0)
}
```

Każda odpowiedź API jest sprawdzana — flaga może zjawić się przy dowolnej akcji, niespodziewanie
jak dobra wiadomość.

---

## 9. Zmienne środowiskowe

```env
OPENAI_API_KEY=...
AI_DEVS_API_KEY=...
AI_DEVS_HUB_ENDPOINT=***hub_endpoint***
AI_DEVS_TASK_NAME=windpower
OPENAI_MODEL=gpt-5.4-nano
OPENAI_TEMPERATURE=
OPENAI_REASONING_EFFORT=low
```

---

## 10. Kluczowe pułapki — przestrogi dla potomnych

1. **`z.record()` jest zakazane** w trybie strict OpenAI — generuje `propertyNames`
   w schemacie JSON, którego API nie toleruje. Zamiast tego: `z.array()` lub `z.string().nullable()`.

2. **`z.string().optional()` nie wystarczy** — właściwość musi figurować w tablicy `required`.
   Stosuj `.nullable()`, które jest obecne w `required`, choć może przyjmować `null`.

3. **Globalna kolejka, nie jobId** — `getResult` zwraca następny wynik z kolejki, nie wynik
   konkretnego zadania. `collectMatchingResult` z `resultPool` zapewnia bezpieczne
   równoległe konsumowanie bez gubienia wyników.

4. **`sourceFunction` w wyniku async** — każdy wynik zawiera pole identyfikujące źródło,
   co pozwala na deterministyczny routing bez założeń o kolejności.

5. **`signedParams` w unlockCodeGenerator** — wynik zawiera `signedParams.startDate`
   i `startHour`, które służą do dopasowania równoległych kodów odblokowujących.

6. **`documentation` to akcja synchroniczna** — param `"documentation"` zwraca dane
   natychmiast, bez kolejkowania. Pozostałe paramy są asynchroniczne.

---

## 11. Kryteria akceptacji

- [ ] Wykonanie mieści się w 40 sekundach
- [ ] Wszystkie okresy wichury mają `turbineMode=idle`, `pitchAngle=90`
- [ ] Punkt produkcji ma `turbineMode=production`, `pitchAngle` z dokumentacji turbiny
- [ ] Każdy punkt konfiguracji ma poprawny `unlockCode`
- [ ] Flaga wychwycona przez regex, nie przez model językowy
- [ ] Buduje się czysto (`npm run build`)
