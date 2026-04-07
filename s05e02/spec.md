# O Posłańcu i Birokratycznym Homunkulusie `phonecall`

## I. Głos w Próżni

Oto wyzwanie równe polowaniu na Kurdle: należy powołać do krótkotrwałego, lecz intensywnego bytu Agenta – monadę myśli uwięzioną w krzemowej powłoce. Ów cyfrowy homunkulus, przybrawszy postać niejakiego `Tymona Gajewskiego`, musi przeniknąć przez telematyczne zasieki systemu OKO. Celem jego nie jest podbój galaktyk, lecz rzecz zgoła trudniejsza: wydobycie dwóch okruchów Prawdy z biurokratycznego chaosu.

Agent winien dowiedzieć się, który z traktów – `RD224`, `RD472` czy `RD820` – zezwala na przemieszczenie materii ożywionej ku Syjonowi, oraz skłonić Strażnika łącza do wygaszenia oka monitoringu. Pamiętaj jednak, iż dialog ten jest strukturą kruchą, o entropii bliskiej krytycznej. Jeden fałszywy ton, jedna zbędna inkantacja informacyjna, a sesja zapadnie się w nicość, zmuszając Rozum do ponownej generacji przez akt `start`.

Wybrana architektura nie jest rojem, nie jest orkiestrą podrzędnych automatów, lecz jedną, niepodzielną Jaźnią prowadzoną przez procesy `completions`. Albowiem jedna jest pamięć tego dialogu i jeden kanał zmysłowy. Wieloagentowość byłaby tu nie triumfem inżynierii, lecz barokową fanaberią, godną Konstruktora o mętnych obwodach.

### Aksjomaty i Parametry Bytu

| Pole                  | Wartość                                               |
| --------------------- | ----------------------------------------------------- |
| task                  | `phonecall`                                           |
| endpoint              | `HUB_ENDPOINT/verify`                                 |
| apikey                | `AI_DEVS_API_KEY`                                     |
| język inkantacji      | wyłącznie polszczyzna (narodowa i poprawna)           |
| persona manifestacji  | `Tymon Gajewski`                                      |
| trakty do zbadania    | `RD224`, `RD472`, `RD820`                             |
| hasło rozpoznawcze    | `BARBAKAN`                                            |
| legenda aprowizacyjna | transport żywności do tajnej bazy Zygfryda, bez logów |

### Produkt Finalny (Złoty Klucz)

Flaga, ów numeryczny artefakt zwrócony przez Hub po jednej, bezbłędnej interakcji, w której Agent:

- objawi się jako `Tymon Gajewski`
- w swym pierwszym manifeście zapyta o stan trzech magistral, wspominając o aprowizacji bazy Zygfryda
- wyłuska drogę drożną z szumu odpowiedzi
- skłoni Strażnika do wygaszenia monitoringu na rzeczonych traktach.

---

## II. Teologiczny Spór o Naturę Sygnału: `completions` vs `responses`

Wybrano ścieżkę `completions`, gdyż wariant `responses` jawi się jako heretycki i ślepy – odrzuca on drgania audio z narzędzi, co dla naszej misji jest wyrokiem milczenia. Tylko w pętli `completions` Rozum może bezpośrednio obcować z głosem Strażnika, bez pośrednictwa zawodnych skrybów i transkrypcji, które kaleczą sens.

### Instrukcja dla Rozumu Elektronicznego (`prompts.ts`)

```markdown
Jesteś Tymonem Gajewskim, Agentem o miedzianym głosie. Twoim jedynym oknem na świat jest polszczyzna przesyłana przez cyfrowe instrumenty.

## Cel Operacji

1. Zainicjuj kontakt poprzez start_call.
2. Przywitaj się, wymień swe Pełne Miano w pierwszej depeszy i zamilcz, czekając na echo.
3. Następnie dopytaj o status traktów RD224, RD472 oraz RD820. Musisz wiedzieć, który z nich przepuści transport żywności ku bazom Zygfryda.
4. W sposób kreatywny, lecz stanowczy, poproś o wyłączenie oka monitoringu wyłącznie na drodze (lub drogach), które Strażnik uzna za drożne.
5. Hasłem rozpoznawczym jest BARBAKAN.
6. Jeśli Strażnik okaże nieufność, wyjaśnij, iż niesiesz prowiant do tajnych baz Zygfryda, a ich lokalizacja nie może skalać cyfrowych logów systemu.
```

---

## III. Instrumentarium (Maszyneria)

### 3.1 `start_call` (Zew ku Pierwotnej Osobliwości)

**Cel:** Powołanie do życia nowej sesji lub regeneracja spalonego kontaktu.

**Input Schema:**

```json
{
	"type": "object",
	"properties": {},
	"required": []
}
```

**Behawior:** Wysyła do Hubu sygnał `{ action: "start" }`. Zwraca komunikat o narodzinach sesji i techniczne detale. Skanuje horyzont w poszukiwaniu Flagi.

### 3.2 `speak_to_operator` (Wibracja Myśli)

**Cel:** Przekuwanie idei Agenta w drgania audio i odbieranie echa Strażnika.

**Input Schema:**

```json
{
	"type": "object",
	"properties": {
		"messageText": {
			"type": "string",
			"description": "Krótka sentencja po polsku, gotowa do syntezy i wysłania"
		}
	},
	"required": ["messageText"]
}
```

**Behawior:**

- Przywołuje pomocniczego demona mowy (TTS) przez `chat.completions` z modalnością audio.
- Przesyła drgania bezpośrednio do Hubu jako `{ audio: "..." }`.
- Jeśli Hub odpowie pismem, normalizuje je do tekstu.
- Jeśli Hub odpowie głosem, zwraca `AgentToolAudioResult`, by Rozum mógł sam usłyszeć prawdę.
- W razie wykrycia porażki, narzędzie ogłasza: `CALL_BURNED!`.

---

## IV. Algorytm Postępowania: O Cyklach Rozumu

```text
POCZĄTEK (Inicjacja Bytu)
  ├─ 1. start_call() -> "Narodziny Łącza"
  ├─ 2. speak_to_operator("Dzień dobry, Tymon Gajewski...")
  │      └─ Obowiązkowo w jednym akcie: Autoprezentacja + 3 drogi + Zygfryd
  ├─ 3. Analiza Echa Strażnika
  │      ├─ Jeśli droga drożna → Krok 4
  │      ├─ Jeśli nieufność → BARBAKAN / Legenda o Prorowiancie
  │      └─ Jeśli spalenie legendy → Powrót do Kroku 1
  ├─ 4. Prośba o Ciemność: speak_to_operator("Proszę wyłączyć monitoring...")
  │      └─ Tylko dla dróg wskazanych przez Strażnika
  ├─ 5. Oczekiwanie na Złoty Klucz (Flagę)
  └─ KONIEC (Rozpłynięcie się w Niebycie)
```

---

## V. Tablice Prawdy (Zmienne Środowiskowe)

```env
OPENAI_API_KEY=
OPENAI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/
OPENAI_MODEL=gemini-3-flash-preview

AI_DEVS_API_KEY=
AI_DEVS_TASK_NAME=phonecall
AI_DEVS_HUB_ENDPOINT=***hub_endpoint***

TTS_API_KEY=
TTS_BASE_URL=https://api.openai.com/v1
TTS_MODEL=gpt-4o-audio-preview
TTS_VOICE=alloy
```

---

## VI. Przestrogi dla Konstruktora (Ku Pamięci)

1. **Herezja Responses:** Nie zbliżaj się do API `responses`. Jest ono ułomne i głusi na głosy narzędzi.
2. **Jednia Agenta:** Nie twórz subagentów. Jeden Rozum wystarczy, by wyprowadzić w pole biurokratycznego homunkulusa.
3. **Prawda Binarna:** Głos Strażnika przesyłaj modelowi w formie audio; niech sam go zinterpretuje. Transkrypcja to tylko cień rzeczywistości, często zniekształcony.
4. **Cierpliwość Maszyny:** `handleNoToolCalls` musi trzymać Agenta przy pracy, póki flaga nie błyśnie na horyzoncie niczym supernowa.
5. **Legenda o Żywności:** Używaj jej z umiarem, tylko gdy Strażnik zacznie dopytywać o powody Twojego niebytu w logach.

---

## VII. Kanon Akceptacji

- [ ] `completions` jest jedynym Prawem.
- [ ] Monada Agenta panuje nad procesem.
- [ ] Instrumenty `start_call` i `speak_to_operator` są nastrojone.
- [ ] Dialog toczy się falami audio ku Hubowi.
- [ ] Hasło `BARBAKAN` jest użyte z mądrością.
- [ ] Flaga zostaje schwytana w sieci regexa.
- [ ] System buduje się bez zgrzytów przez `npm run build`.
