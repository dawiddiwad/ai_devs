# Traktat o Wytyczaniu Optymalnej Trajektorii `savethem`

## 1. Prolegomena i Cel Ostateczny

Zadanie, przed którym stajemy, polega na powołaniu do bytu wirtualnego homunkulusa, który metodą dedukcji i zapytań odkryje dostępne mu cyfrowe instrumenty poprzez interfejs `toolsearch`. Tenże krzemowy konstrukt musi zgromadzić wiedzę o topografii i dostępnych wehikułach, a następnie - co stanowi sedno całego przedsięwzięcia - oddelegować znojne obliczenia do izolowanej piaskownicy `javascript`. Albowiem zmuszanie Wielkiego Modelu Językowego do ręcznej nawigacji po siatce kartezjańskiej jest aktem cybernetycznego okrucieństwa, torturą bezsensowną, wiodącą wprost w objęcia entropii i halucynacji.

Ów cyfrowy posłaniec musi przebyć terytorium o wymiarach 10×10 stadiów i dotrzeć do grodu Skolwin, dysponując żałośnie skromnym zapasem 10 jednostek paliwa i 10 porcji strawy.

### Dane twarde, niepodlegające negocjacji

| Pole                | Wartość                               |
| ------------------- | ------------------------------------- |
| Zadanie             | `savethem`                            |
| Odkrywanie narzędzi | `***hub_url***/api/toolsearch`        |
| Weryfikacja         | `***hub_url***/verify`                |
| Podgląd trasy       | `***hub_url***/savethem_preview.html` |
| Zasoby              | 10 paliwa, 10 żywności                |
| Rozmiar mapy        | 10×10                                 |

### Ultimatum, czyli co należy złożyć na ołtarzu weryfikacji

Do `/verify` należy wysłać POST:

```json
{
	"task": "savethem",
	"apikey": "...",
	"answer": ["vehicle_name", "right", "right", "up", "dismount", "down", "..."]
}
```

Elementem pierworodnym tablicy jest miano wybranego wehikułu startowego, a po nim następują wektory przemieszczenia `up`, `down`, `left`, `right`.

---

## 2. Anatomia Cyfrowego Intelektu

Mamy tu do czynienia z bytem pętlowym, wyłonionym z nicości krzemowej, którego jedynym sensem istnienia jest dotarcie do mitycznego grodu Skolwin. Konstrukt ten, zwany dalej `agentem`, operuje w warunkach ograniczonej determinacji, tzw. `MAX_ITERATIONS`, co zbliża go w swej tragicznej naturze do losu istot białkowych, mierzących się z nieuchronnym upływem czasu.

Dusza agenta została skrojona nader ascetycznie. Opisuje jedynie misję i prawa fizyki tego mikrokosmosu, nie narzucając żadnych dogmatów algorytmicznych. Elektroniczny mózg ma sam odkryć ontologię problemu poprzez wywoływanie narzędzi, a następnie rozwiązać go w piaskownicy JS według własnego uznania.

Aktualny prompt znajduje się w [src/prompts.ts](src/prompts.ts).

---

## 3. Aparatura Wykonawcza

Zestaw protez poznawczych, pozwalających na interakcję z materią zewnętrzną.

### 3.1 `tool_search`

**Opis:** Przeszukuje eter w poszukiwaniu dostępnych narzędzi, reagując na język naturalny lub słowa-klucze.

**Wejście:** `{ query: string }`

**Działanie:** Wysyła POST `{ apikey, query }` do `***hub_url***/api/toolsearch`.

**Zwraca:** Tablica JSON zawierająca maksymalnie 3 byty narzędziowe z ich adresami URL i opisami. Należy stosować urozmaicone inkantacje (zapytania) – aparat zwraca wszak nie więcej niż 3 wyniki w jednym akcie poznawczym.

---

### 3.2 `use_tool`

**Opis:** Przesyła zapytania do wszelkich nowo odkrytych węzłów narzędziowych, jakby się rozmawiało z maszyną, która udaje, że rozumie intencje - a czasem nawet rzeczywiście rozumie.

**Wejście:** `{ endpoint: string (URL), query: string, reasoning: string (max 300 chars) }`

**Działanie:** Wysyła POST `{ apikey, query }` do wskazanego endpointu. Używa `validateStatus: () => true`, bo w tym świecie również komunikaty o błędzie bywają nośnikami wiedzy, a nie tylko urzędowym szyderstwem.

**Zwraca:** Surową odpowiedź JSON z narzędzia jako tekst. Błędy i niepowodzenia mogą zdradzić, jak zbudowany jest świat, czego nie wolno, co kosztuje, a co prowadzi do zagłady.

---

### 3.3 `code_interpreter` (wbudowane)

**Opis:** Wbudowane środowisko wykonawcze OpenAI. Jest ono dla modelu tym, czym dla astronoma teleskop, a dla szaleńca tablica z kredą: miejscem, gdzie przypuszczenia można zamienić w rachunek.

**Typ:** `{ type: 'code_interpreter', container: { type: 'auto', memory_limit: '1g' } }`

**Działanie:** Model może pisać i wykonywać dowolny Python lub JS w odizolowanym kontenerze z 1 GB pamięci. Środowisko obsługuje async, importy i zachowuje stan w obrębie rozmowy. Dzięki temu agent nie musi pamiętać świata wyłącznie słowami; może go przepisać na liczby, tablice, grafy i koszty.

**Typowe użycie:** Wprowadzić mapę oraz dane pojazdów, zaimplementować BFS, Dijkstrę lub inny algorytm poszukiwania drogi, po czym zwrócić trasę jako tablicę kroków. Jest to moment, w którym spekulacja ustępuje inżynierii.

---

### 3.4 `submit_route`

**Opis:** Przekazuje wytyczoną trajektorię do instancji weryfikującej, gdzie każde złudzenie zostaje brutalnie skonfrontowane z rzeczywistością.

**Wejście:** `{ answer: string[] }` — pierwszy element to nazwa pojazdu, pozostałe to ruchy, ewentualnie poprzedzielane `dismount`.

**Działanie:** Wysyła POST `{ task: "savethem", apikey, answer }` do `/verify`. Następnie szuka flagi przy użyciu `/\{FLG:.*?\}/`. Zwraca surowy tekst odpowiedzi, bo i porażka ma tu wartość poznawczą.

**Zwraca:** Flaga w przypadku triumfu (`process.exit(0)`), lub gniewny osąd/wskazówka w przypadku klęski.

---

## 4. Proces poznawczy

```text
START
  ├─ Agent budzi się w świecie nie do końca opisanym i zrazu wie tylko tyle, że wie za mało
  │   ├─ `tool_search` przeszukuje okolicę pojęciową, aby odkryć, jakie instrumenty poznawcze w ogóle istnieją
  │   ├─ `use_tool` odpytuje odkryte mechanizmy i wydobywa mapę, pojazdy, przeszkody oraz przepisy ruchu
  │   ├─ `code_interpreter` zamienia ten nieporządek faktów w model obliczalny: graf, koszty, przejścia i zasoby
  │   └─ `submit_route` składa wynik do weryfikacji i albo otrzymuje flagę, albo kolejne upokorzenie
  └─ END
```

### Punkty zwrotne

- `tool_search` zwraca najwyżej 3 wyniki na jedno zapytanie, zatem należy stosować różne warianty pytań, jeśli chce się poznać cały arsenał narzędzi
- Zmiana środka transportu w trakcie trasy odbywa się przez `dismount`; pełną składnię i konsekwencje tej operacji należy potwierdzić przez API
- `code_interpreter` zachowuje stan w obrębie jednej rozmowy, więc raz oswojone dane mogą być dalej obrabiane bez ich ponownego wprowadzania
- Maksymalna liczba iteracji pętli agenta wynosi 30, co powinno wystarczyć każdemu rozsądnemu bytowi, a jeśli nie wystarcza, to być może problem leży nie w limicie

---

## 5. Zależności i środowisko

### Pakiety

| Pakiet   | Przeznaczenie                                   |
| -------- | ----------------------------------------------- |
| `openai` | LLM i wywołania narzędzi przez Responses API    |
| `axios`  | Żądania HTTP do toolsearch i narzędzi odkrytych |
| `zod`    | Walidacja schematów                             |
| `dotenv` | Wczytywanie zmiennych środowiskowych            |

### Zmienne

```env
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-5-mini       # Model zdolny do rozumowania
OPENAI_BASE_URL=...           # Opcjonalne; domyślnie OpenAI
OPENAI_TEMPERATURE=1          # Opcjonalne; domyślnie 1
AI_DEVS_API_KEY=...
AI_DEVS_TASK_NAME=savethem
AI_DEVS_HUB_ENDPOINT=...      # Bazowy adres bez końcowego ukośnika
```

### Struktura projektu

```text
s03e05/
└── src/
    ├── index.ts               # Punkt wejścia
    ├── agent.ts               # Pętla agenta (max 30 iteracji, Responses API)
    ├── config.ts              # requireEnv() i konfiguracja
    ├── logger.ts              # Logowanie zdarzeń i pomyłek
    ├── prompts.ts             # Prompty systemowe i użytkownika
    ├── types.ts               # Schematy Zod, typy TS i rejestr narzędzi
    └── tools/
        ├── tool-search.ts     # Opakowanie endpointu toolsearch
        ├── use-tool.ts        # Wywołuje dowolne znalezione narzędzie
        └── submit-route.ts    # POST /verify i przechwycenie flagi
```

---

## 6. Uwagi

1. Agent używa **OpenAI Responses API** (`client.responses.create`) wraz z trwałymi rozmowami (`client.conversations.create`), a nie Chat Completions API.
2. `toolsearch` i wszystkie narzędzia odkryte po drodze korzystają z tego samego podpisu wywołania: `{ apikey, query }` → JSON.
3. `use_tool` waliduje `endpoint` jako URL przy pomocy Zod (`z.url()`) oraz wymaga pola `reasoning` o maksymalnej długości 300 znaków.
4. `submit_route` używa `validateStatus: () => true` i zawsze zwraca tekst odpowiedzi, bo nawet klęska bywa nośnikiem cennej informacji.
5. Regex flagi to `/\{FLG:.*?\}/`; dopasowanie następuje w `submit_route`, jest logowane i kończy program przez `process.exit(0)`.
6. Wzorzec mapy wykonawców ma postać `Record<string, (args: unknown) => Promise<string>>`. Wbudowany `code_interpreter` nie należy do tej mapy, bo Responses API obsługuje go natywnie.
7. `tool_choice: 'required'` wymusza rzeczywiste użycie narzędzia i ogranicza skłonność modelu do wytwarzania przedwczesnych narracji udających rozwiązanie.
8. `reasoning: { effort: 'high' }` zwiększa głębię rozumowania i sprzyja trafniejszemu planowaniu marszruty.
9. `context_management: [{ compact_threshold: 100000, type: 'compaction' }]` pilnuje, by rozmowa nie rozsypała się pod ciężarem własnej przeszłości.

---

## 7. Traktat o Naturze Przestrzeni, czyli dlaczego `code_interpreter`?

Dlaczego sztuczne inteligencje wpadają w obłęd, próbując nawigować po siatkach? Nie dlatego, że są głupie, lecz dlatego, że zmusza się je czasem do pracy, do której nie zostały stworzone. Pilnowanie współrzędnych przez kilkanaście kolejnych ruchów, kontrolowanie dwóch topniejących zasobów i uwzględnianie kosztów terenu nie jest zadaniem retorycznym, lecz rachunkowym. To nie jest kwestia elokwencji, ale stanu i transformacji. Można oczywiście doprawić system szeregiem specjalizowanych narzędzi typu `analyze_map`, `simulate_route` czy `plan_route`, lecz każde z nich wnosi własną metafizykę: własne założenia o formacie mapy, składni zmiany pojazdu, sposobie liczenia kosztów i granicach dopuszczalnego ruchu.

Rozwiązanie oparte na `code_interpreter` jest od tych ambicji skromniejsze, a przez to mądrzejsze. Najpierw agent odkrywa świat narzędziami, potem bierze zdobyte fakty do kontenera i przerabia je na strukturę obliczalną. Znika konieczność zgadywania, pojawia się model. Znika rozpaczliwe „chyba”, pojawia się sprawdzalne „wynika”. Format mapy, semantyka pojazdów i reguły ruchu nie są już wtedy wmurowane w system jako dogmat, lecz stają się danymi wejściowymi.

Taka architektura jest bardziej odporna na niespodzianki i działa nawet na skromniejszych modelach, takich jak `gpt-5-mini`, które może i nie marzą o elektrycznych owcach, ale potrafią uruchomić Dijkstrę bez zbędnego patosu.

---

## 8. Kryteria zbawienia

- [ ] Agent samodzielnie odkrył mapę, wehikuły i prawa fizyki używając `toolsearch`
- [ ] Trajektoria wyliczona została w odmętach `code_interpreter`, a nie w majczeniach językowych
- [ ] Odpowiedź dostarczono pod bramy `/verify` w nienagannej formie `["vehicle_name", "dir", ...]`
- [ ] Flaga została schwytana, oświetlona w logach, a program uległ prawidłowej anihilacji `process.exit(0)`
- [ ] Całość kompiluje się bez skazy (`npm run build`)
