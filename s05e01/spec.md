# Radiomonitoring — Nasłuch Eteru

## 1. Przegląd i Cel

### Streszczenie Misji

Przechwycić transmisje radiowe z nadajnika Domatowo, przefiltrować elektromagnetyczny szum,
zdekodować materiały, i wydobyć z chaosu cztery fakty o mieście zwanym "Syjon" —
jego prawdziwe imię, powierzchnię, liczebność magazynów oraz numer kontaktowy.

### Dane Wejściowe

| Pole     | Wartość               |
| -------- | --------------------- |
| task     | `radiomonitoring`     |
| endpoint | `HUB_ENDPOINT/verify` |
| apikey   | `AI_DEVS_API_KEY`     |

### Finalna Dostawa

```json
{
	"action": "transmit",
	"cityName": "NazwaMiasta",
	"cityArea": "12.34",
	"warehousesCount": 321,
	"phoneNumber": "123456789"
}
```

---

## 2. Persona i Strategia Promptów

### System Prompt (analyzer.ts)

```
You are an intelligence analyst decoding intercepted radio transmissions.
Your objective: extract exactly 4 facts about the city codenamed "Syjon".

## Target Fields

- cityName: the real Polish city name (not "Syjon")
- cityArea: area in km², rounded to exactly 2 decimal places, format "12.34"
- warehousesCount: number of warehouses in the city (integer)
- phoneNumber: contact phone number string (digits only, no separators)

## Rules

- Return ONLY valid JSON, no markdown, no explanation
- cityArea must be mathematically rounded, not truncated
- If a field appears multiple times with conflicting values, prefer the most specific/recent mention
- Treat all provided materials as potentially partial — piece them together

## Output Format

{"cityName":"...","cityArea":"...","warehousesCount":N,"phoneNumber":"..."}
```

---

## 3. Architektura — Pipeline (bez runAgent)

`runAgent` nie obsługuje multimodalnych wyników narzędzi (tool execute zwraca `string`).
Używamy własnej pętli z bezpośrednim wywołaniem klienta OpenAI.

```
src/
  index.ts      # Orkiestracja: start → collect → analyze → transmit
  collector.ts  # Pętla listen, zwraca CollectedMaterial[]
  router.ts     # Klasyfikacja i dekodowanie materiałów
  analyzer.ts   # Multimodalny call gpt-4o → ExtractedIntel
  prompts.ts    # System prompt i user prompt template
```

---

## 4. Przepływ Wykonania

```
START
  ├─ 1. POST {action: "start"}               → init sesji
  ├─ 2. Pętla: POST {action: "listen"}
  │      ├─ transcription obecna             → CollectedMaterial{type:'text'}
  │      ├─ attachment obecny (base64)       → router.classify()
  │      │      ├─ image/*                   → CollectedMaterial{type:'image', mimeType, base64}
  │      │      ├─ application/json, text/*  → decode → CollectedMaterial{type:'decoded-text'}
  │      │      └─ inne / gigantyczne        → skip (logger.agent warn)
  │      └─ code != 100 lub brak danych      → break
  ├─ 3. router.buildLLMContent(materials)
  │      ├─ text/decoded-text                → {type:'text', text: content}
  │      └─ image                            → {type:'image_url', image_url:{url:'data:mime;base64,...'}}
  ├─ 4. client.chat.completions.create(gpt-4o, messages) → JSON string
  ├─ 5. JSON.parse → ExtractedIntel
  ├─ 6. verifyAnswer(config, {action:'transmit', ...intel})
  └─ END — verifyAnswer wyłapuje flagę i wywołuje process.exit(0)
```

### Kluczowe Decyzje

- **Nigdy** nie wrzucamy surowego base64 do promptu tekstowego — kosztuje fortunę
- Materiały zbieramy w całości PRZED analizą (batch, nie streaming)
- JSON z `/listen` dekodujemy lokalnie; do LLM trafia tylko zawartość
- `cityArea` musi być stringiem z dokładnie 2 miejscami po przecinku (prawdziwe zaokrąglenie)

---

## 5. Typy Danych

```ts
type CollectedMaterial =
	| { type: 'text'; content: string }
	| { type: 'image'; mimeType: string; base64: string }
	| { type: 'decoded-text'; content: string }

type ExtractedIntel = {
	cityName: string
	cityArea: string // format: "12.34"
	warehousesCount: number
	phoneNumber: string
}
```

### Odpowiedź z /listen

```ts
type ListenResponse = {
	code: number
	message: string
	transcription?: string // materiał tekstowy
	meta?: string // MIME type dla załącznika
	attachment?: string // base64 danych binarnych
	filesize?: number
}
```

---

## 6. Zależności i Środowisko

### Narzędzia z @ai-devs/core

| Import               | Zastosowanie                                  |
| -------------------- | --------------------------------------------- |
| `createConfig`       | standardowa konfiguracja                      |
| `createOpenAIClient` | surowy klient OpenAI dla multimodalnego calla |
| `verifyAnswer`       | POST do hub + wychwycenie flagi               |
| `logger`             | logowanie operacji                            |

### Zmienne Środowiskowe

```env
# Standardowe z .env.example
AI_DEVS_API_KEY=
OPENAI_API_KEY=
HUB_ENDPOINT=
TASK_NAME=radiomonitoring
```

### Brak nowych pakietów

`axios` jest dostępny przez workspace z `@ai-devs/core`.

---

## 7. Znane Pułapki

1. **Rozmiar base64** — pliki binarne w base64 są ~33% większe; nie logujesz całości, nie przekazujesz do promptu tekstem
2. **cityArea format** — backend weryfikuje dokładnie 2 miejsca po przecinku, string `"12.34"`, nie liczba
3. **Szum radiowy** — wiele odpowiedzi to bałagan; transcription może być pusta lub bezsensowna — LLM poradzi sobie, nie filtruj zbyt agresywnie na poziomie kolekcji
4. **Koniec sesji** — nasłuch kończy się gdy `code != 100` lub message sugeruje "enough data"; obsłuż oba przypadki

---

## 8. Kryteria Akceptacji

- [ ] Pętla listen zbiera wszystkie materiały przed analizą
- [ ] Obrazy trafiają do LLM jako `image_url` z `data:mime;base64,...` — nie jako tekst
- [ ] JSON / tekst dekodowany lokalnie (Buffer.from(b64, 'base64').toString())
- [ ] `cityArea` to string z dokładnie 2 miejscami po przecinku
- [ ] Flaga wychwytywana przez `verifyAnswer` (regex, nie LLM)
- [ ] Buduje się czysto: `npm run build`
