# Telefon do Strażnika `phonecall`

## 1. Ekspozycja i Cel Operacji

### Summa zadania

Należy skonstruować agenta, który podejmie rozmowę głosową z operatorem systemu OKO i nie spali swej legendy, nim wydobędzie z niej dwa fakty o doniosłości strategicznej: która z dróg `RD224`, `RD472`, `RD820` nadaje się do przerzutu ludzi do Syjonu oraz czy monitoring tejże drogi został wyłączony. Rozmowa jest sekwencją kruchą niczym szkło laboratoryjne: błędna kolejność, nadmiar informacji lub niewłaściwy zwrot mogą unicestwić sesję, zmuszając maszynę do ponownego narodzenia przez akcję `start`.

Wybrana architektura nie jest rojem, nie jest orkiestrą podrzędnych homunkulusów, lecz jednym tylko Rozumem Elektronowym prowadzonym przez `completions`. Powód jest prosty: istnieje tu jedna pamięć rozmowy, jeden cel i jeden kanał zmysłowy. Wieloagentowość byłaby już nie inżynierią, lecz dekoracją.

### Parametry wejściowe i aksjomaty misji

| Pole                  | Wartość                                               |
| --------------------- | ----------------------------------------------------- |
| task                  | `phonecall`                                           |
| endpoint              | `HUB_ENDPOINT/verify`                                 |
| apikey                | `AI_DEVS_API_KEY`                                     |
| język rozmowy         | wyłącznie polski                                      |
| tożsamość agenta      | `Tymon Gajewski`                                      |
| drogi do ustalenia    | `RD224`, `RD472`, `RD820`                             |
| hasło operatorów      | `BARBAKAN`                                            |
| uzasadnienie awaryjne | transport żywności do tajnej bazy Zygfryda, bez logów |

### Produkt finalny

Flaga zwrócona przez hub po jednej poprawnie przeprowadzonej rozmowie, w której agent:

- przedstawi się jako `Tymon Gajewski`
- w pierwszej właściwej wypowiedzi zapyta o status wszystkich trzech dróg i wspomni o transporcie do jednej z baz Zygfryda
- ustali drogę przejezdną
- doprowadzi do wyłączenia monitoringu dla drogi lub dróg uznanych przez operatora za przejezdne

---

## 2. Persona Agenta i Strategia Promptu

### Uzasadnienie wyboru architektury

Wybrano `runAgent(..., { api: 'completions' })`, ponieważ:

- `@ai-devs/core` umie już przenosić audio jako wynik narzędzia w pętli `completions`
- wariant `responses` jawnie odrzuca audio tool results, a więc dla tego zadania byłby ślepym zaułkiem
- jedna rozmowa telefoniczna wymaga wspólnej pamięci kolejnych odpowiedzi operatora, więc pojedynczy agent jest naturalnym nośnikiem stanu

Nie wybrano automatu deterministycznego, mimo że byłby bardziej pancerny, ponieważ użytkownik jawnie preferuje czystego pojedynczego agenta. Spec kompensuje tę decyzję przez twarde reguły promptu, mały zestaw narzędzi i ograniczenie swobody wypowiedzi.

### Zarys promptu systemowego (`prompts.ts`)

```markdown
You are a covert Polish-speaking caller conducting a short operational phone call.

Your identity is Tymon Gajewski.
Your only channel is spoken Polish messages sent through tools.

## Goal

1. Start the call session.
2. Ask for the status of RD224, RD472, and RD820 in one short opening message.
3. In that same opening message, mention that the question is related to transport organized to one of Zygfryd's bases.
4. Determine which road or roads are passable.
5. Ask the operator to disable monitoring on the passable road or roads.
6. If the operator asks why monitoring must be disabled, explain that it is for food transport to one of Zygfryd's secret bases and the mission cannot appear in logs.
7. Use the password BARBAKAN only if authentication, trust, or operator procedure clearly requires it.
8. Finish only when the hub returns the final success response.

## Rules

- Speak only in Polish.
- Keep every utterance short, natural, and plausible.
- Do not switch to text-only reasoning in place of tool use.
- After start_call(), communicate only through speak_to_operator().
- If the conversation is burned, restart from the beginning with start_call().
- Never ask for unrelated details.
- Do not mention Syjon directly to the operator.
```

### Prompt użytkownika

```markdown
Start the phone operation now. Begin by opening the session, then conduct the conversation step by step.
```

---

## 3. Definicje Narzędzi

### 3.1 `start_call`

**Cel:** Rozpocząć nową sesję rozmowy lub zresetować spalony kontakt.

**Input Schema:**

```json
{
	"type": "object",
	"properties": {},
	"required": []
}
```

**Behawior:**

- Wysyła do hubu payload `{ action: "start" }`.
- Zwraca krótki tekst typu `CALL_STARTED` wraz z techniczną odpowiedzią huba.
- Każdą odpowiedź skanuje regexem w poszukiwaniu flagi przed zwróceniem wyniku.

**Zwraca:** `string`

### 3.2 `speak_to_operator`

**Cel:** Zamienić wypowiedź tekstową agenta na audio, wysłać ją do huba i oddać odpowiedź operatora w formie użytecznej dla modelu.

**Input Schema:**

```json
{
	"type": "object",
	"properties": {
		"messageText": {
			"type": "string",
			"description": "Krótka wypowiedź po polsku do zsyntezowania i wysłania operatorowi"
		}
	},
	"required": ["messageText"]
}
```

**Behawior:**

- Waliduje, że `messageText` nie jest puste i nie wygląda na wieloakapitowy monolog.
- Woła wewnętrzny adapter `synthesizeSpeech(messageText)` ukryty za provider-agnostic interfejsem.
- Otrzymane audio koduje do base64 i wysyła do huba jako `{ audio: "..." }`.
- Jeśli hub zwróci tekst lub JSON, narzędzie normalizuje wynik do `string`.
- Jeśli hub zwróci nagranie audio, narzędzie zwraca `AgentToolAudioResult`, aby pętla `completions` mogła przekazać operatora modelowi jako `input_audio`.
- Każdą odpowiedź skanuje regexem w poszukiwaniu flagi przed zwróceniem wyniku.
- Jeśli odpowiedź jasno sygnalizuje spaloną rozmowę, narzędzie zwraca czytelny marker tekstowy, np. `CALL_BURNED: ...`, zamiast maskować problem.

**Zwraca:** `string | AgentToolAudioResult`

---

## 4. Przepływ Wykonania

```text
START
  ├─ 1. start_call()
  ├─ 2. speak_to_operator("Dzień dobry, Tymon Gajewski...")
  │      └─ obowiązkowo w jednej krótkiej wiadomości:
  │         - przedstawienie się
  │         - pytanie o RD224, RD472, RD820
  │         - wzmianka o transporcie do jednej z baz Zygfryda
  ├─ 3. Analiza odpowiedzi operatora
  │      ├─ jeśli operator poda drogi przejezdne → przejście do kroku 4
  │      ├─ jeśli operator dopytuje / weryfikuje → krótka odpowiedź, ewentualnie BARBAKAN
  │      └─ jeśli rozmowa spalona → wróć do kroku 1
  ├─ 4. speak_to_operator("Proszę wyłączyć monitoring...")
  │      └─ obejmij tylko drogę lub drogi, które operator uznał za przejezdne
  ├─ 5. Jeśli operator pyta o powód
  │      └─ speak_to_operator("Transport żywności...")
  ├─ 6. Oczekiwanie na potwierdzenie i wynik huba
  │      ├─ jeśli przychodzi flaga → END
  │      ├─ jeśli operator wymaga dalszego doprecyzowania → kolejna krótka wypowiedź
  │      └─ jeśli sesja spalona → wróć do kroku 1
  └─ END
```

### Kluczowe punkty decyzyjne

1. **Hasło `BARBAKAN` nie jest wstępem ceremonialnym.** Agent używa go wyłącznie wtedy, gdy operator żąda potwierdzenia procedury, tożsamości lub uprawnień.
2. **Pierwsza wiadomość jest obowiązkowo złożona, lecz nie rozwlekła.** Musi zawierać trzy drogi i kontekst transportu do bazy Zygfryda, mimo ogólnej zasady krótkich wypowiedzi.
3. **Wyłączenie monitoringu dotyczy tylko dróg uznanych przez operatora za przejezdne.** Agent nie zgaduje, nie naciska na drogi odrzucone.
4. **Syjon nie pada w rozmowie.** To cel naszej organizacji, nie temat dla operatora.
5. **Restart jest pełnym restartem.** Po markerze `CALL_BURNED` agent nie kontynuuje dyskusji, tylko ponownie otwiera sesję przez `start_call()`.

---

## 5. Zależności i Środowisko

### Dodatki do `package.json`

| Pakiet                               | Cel                                                        |
| ------------------------------------ | ---------------------------------------------------------- |
| brak obowiązkowych nowych zależności | preferowany jest `fetch` + istniejący stos `@ai-devs/core` |

Jeśli wybrany backend TTS okaże się zbyt uciążliwy bez SDK, dopuszczalne jest dodanie jednej lekkiej zależności klienta dla tego providera, ale nie wolno rozsadzać projektu całą orkiestrą bibliotek audio.

### Zmienne środowiskowe

```env
OPENAI_API_KEY=
OPENAI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/
OPENAI_MODEL=gemini-3-flash-preview

AI_DEVS_API_KEY=
AI_DEVS_TASK_NAME=phonecall
AI_DEVS_HUB_ENDPOINT=***hub_endpoint***

TTS_PROVIDER=openai
TTS_API_KEY=
TTS_BASE_URL=
TTS_MODEL=
TTS_VOICE=
```

### Struktura projektu

```text
src/
  index.ts                  # Cienki start: createConfig + runAgent
  prompts.ts                # System i user prompt
  hub.ts                    # Wspólna komunikacja z hubem + regex flagi
  audio/
    tts.ts                  # Provider-agnostic synthesizeSpeech()
  tools/
    index.ts                # Rejestr [startCallTool, speakToOperatorTool]
    start-call.ts           # action:start
    speak-to-operator.ts    # TTS -> hub -> tekst lub audio
```

---

## 6. Kluczowe Uwagi Implementacyjne

1. **`responses` jest tu heretycką ślepą uliczką.** Rdzeń `@ai-devs/core` już dziś odrzuca audio tool results dla tego API, więc implementacja ma używać wyłącznie `completions`.
2. **Wymagany jest minimalny patch w `@ai-devs/core`.** Pętla `completions` ma przekazywać `toolChoice` do requestu, a jeśli typy i provider to wspierają, także odpowiednik `reasoning effort`. Nie należy przy tej okazji budować wielkiej nowej warstwy multimodalnej.
3. **Nie wolno kastrować odpowiedzi modelu do gołego stringa przedwcześnie.** Należy zachować pełny obiekt wiadomości asystenta w historii, aby nie utracić provider-specific metadanych istotnych dla Gemini.
4. **`handleNoToolCalls` ma być aktywny.** Jeśli agent spróbuje zakończyć rozmowę bez użycia narzędzi i bez sukcesu, runner ma dopisać przypomnienie i zmusić go do dalszego działania zamiast kapitulować.
5. **Adapter TTS ma być wymienialny, lecz interfejs ma być ascetyczny.** Jedna funkcja `synthesizeSpeech(text)` zwraca `{ base64, format }`. Reszta świata nie zna providera.
6. **Audio przychodzące od operatora należy przekazać modelowi w postaci binarnej, nie transkrybować go na siłę.** Gemini 3 Flash umie rozumieć audio; dodatkowa STT byłaby kosztem, opóźnieniem i miejscem potencjalnej mutacji sensu.
7. **Flagę należy łapać programowo w każdym wywołaniu huba.** Nie czekamy, aż model łaskawie rozpozna triumf.
8. **Każda wypowiedź wychodząca ma być krótka i realistyczna.** To nie traktat o logistyce, tylko telefon do operatora, który ma nie nabrać podejrzeń.
9. **Pierwsza wiadomość jest wyjątkiem kontrolowanym.** Musi zawrzeć trzy wymagane drogi i kontekst Zygfryda, ale wciąż ma brzmieć jak jedno naturalne zdanie lub dwa krótkie zdania.
10. **Wyjaśnienie o żywności i braku logów jest odpowiedzią warunkową.** Agent nie wyrzuca tej informacji z siebie bez pytania operatora.

---

## 7. Kryteria Akceptacji

- [ ] `spec.md` ustanawia `completions` jako jedyne API dla tego zadania
- [ ] Implementacja przewiduje dokładnie jednego agenta i brak subagentów
- [ ] Istnieją dwa podstawowe narzędzia: `start_call` i `speak_to_operator`
- [ ] Komunikacja po `start` odbywa się wyłącznie przez audio wysyłane do huba
- [ ] Odpowiedzi operatora mogą wrócić jako tekst albo `AgentToolAudioResult`
- [ ] Agent zna kolejność wymaganych etapów rozmowy i umie restartować sesję po spaleniu kontaktu
- [ ] Hasło `BARBAKAN` jest obsłużone jako warunkowy element rozmowy
- [ ] Flaga jest wychwytywana programowo regexem w warstwie narzędziowej / hubowej
- [ ] Zakres zmian w `@ai-devs/core` pozostaje minimalny i ogranicza się do brakujących pól requestu `completions`
- [ ] Projekt buduje się bez błędów przez `npm run build`
