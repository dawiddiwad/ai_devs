# Natanaaaaa? `filesystem`

## 1. Przegląd i Cel

### Streszczenie Zadania

Agent autonomicznie pobiera chaotyczne notatki Natana (archiwum ZIP), lokalnie wyodrębnia dane handlowe z plików strukturalnych, zapisuje wynik preprocessingu po stronie narzędzi i zostawia modelowi językowemu tylko złożenie brakujących nazw osób z krótkich wskazówek.

### Dane Wejściowe

| Pole                 | Wartość                                            |
| -------------------- | -------------------------------------------------- |
| Nazwa zadania        | `filesystem`                                       |
| Endpoint weryfikacji | `config.verifyEndpoint` (`HUB_ENDPOINT + /verify`) |
| URL notatek          | `HUB_ENDPOINT/dane/natan_notes.zip`                |
| Podgląd filesystem   | `HUB_ENDPOINT/filesystem_preview.html`             |

### Produkt Finalny

Flaga `{FLG:...}` zwrócona przez akcję `done` po pomyślnej weryfikacji struktury plików.

---

## 2. Persona i Strategia Promptu

### System Prompt

Agent analityczny. Reguły: brak polskich znaków w nazwach plików/JSON, mianownik liczby pojedynczej dla towarów, transliteracja ą→a itp. Prompt wymusza użycie lokalnego preprocessingu, pracy na uchwycie `datasetId` i jednego narzędzia do finalnego submitu.

---

## 3. Definicje Narzędzi

### 3.1 `download_notes`

**Opis:** Pobiera i rozpakowuje archiwum ZIP z notatkami Natana.

**Schema wejściowa:** `{}` (brak parametrów)

**Zachowanie:** GET na URL ZIP → rozpakowuje adm-zip → konkatenuje tekst wszystkich plików

**Zwraca:** Połączoną treść wszystkich notatek z nagłówkami plików

### 3.2 `preprocess_notes`

**Opis:** Lokalnie parsuje notatki, zapisuje wynik w pamięci procesu i zwraca małe podsumowanie dla modelu.

**Schema wejściowa:**

```json
{
	"rawNotesText": "string"
}
```

**Zachowanie:** Tokenizacja + stemmer + fuzzy matching budują dane handlowe, które są zapisywane lokalnie pod `datasetId`. Model dostaje tylko:

```json
{
	"datasetId": "uuid",
	"resolvedPeople": { "miasto": "Imie Nazwisko" },
	"unresolvedPeople": [{ "city": "miasto", "names": [], "snippets": ["..."] }]
}
```

**Zwraca:** Minimalny payload potrzebny agentowi bez pełnej treści rozmów i bez map handlowych.

### 3.3 `submit_filesystem`

**Opis:** Bierze `datasetId` z preprocessingu oraz finalną listę `people`, po czym lokalnie buduje wszystkie akcje filesystem API, resetuje stan i wykonuje końcową weryfikację.

**Schema wejściowa:**

```json
{
	"datasetId": "string",
	"people": [{ "city": "miasto", "person": "Imie Nazwisko" }]
}
```

**Zachowanie:** Narzędzie samo wykonuje `reset`, jeden batch `createDirectory/createFile`, a potem `done`.

---

## 4. Przepływ Wykonania

```
START
  ├─ 1. download_notes → odczytaj notatki Natana
  ├─ 2. preprocess_notes(rawNotesText) → datasetId + resolvedPeople + unresolvedPeople
  ├─ 3. Analiza LLM: złóż tylko brakujące nazwy osób z city-specific snippets
  ├─ 4. submit_filesystem(datasetId, people) → reset + batch + done
  └─ END
```

---

## 5. Zależności i Środowisko

### Dodatkowe Paczki

| Paczka         | Cel                |
| -------------- | ------------------ |
| adm-zip        | Rozpakowywanie ZIP |
| @types/adm-zip | Typy TS            |

### Zmienne Środowiskowe

```env
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-5-mini
AI_DEVS_API_KEY=...
AI_DEVS_TASK_NAME=filesystem
AI_DEVS_HUB_ENDPOINT=...
```

### Struktura Projektu

```
src/
  index.ts              # Cienki entry z runAgent()
  prompts.ts            # System + user prompt
  tools/
    index.ts            # Rejestr narzędzi
    download-notes.ts   # Pobieranie ZIP z notatkami
    preprocess-notes.ts # Zapis preprocessingu i mały payload dla LLM
    submit-filesystem.ts # Lokalny reset, batch create i done
    verify.ts           # (nieużywany, zastąpiony przez filesystem-api)
```
