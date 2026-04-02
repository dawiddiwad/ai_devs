# Natanaaaaa? `filesystem`

## 1. Przegląd i Cel

### Streszczenie Zadania

Agent autonomicznie pobiera chaotyczne notatki Natana (archiwum ZIP), analizuje je modelem językowym w celu wyodrębnienia danych handlowych (miasta, osoby, towary), a następnie buduje strukturę katalogów w zdalnym filesystem API jednym batchem.

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

Agent analityczny. Reguły: brak polskich znaków w nazwach plików/JSON, mianownik liczby pojedynczej dla towarów, transliteracja ą→a itp. Zawiera opis oczekiwanej struktury katalogów z przykładami zawartości.

---

## 3. Definicje Narzędzi

### 3.1 `download_notes`

**Opis:** Pobiera i rozpakowuje archiwum ZIP z notatkami Natana.

**Schema wejściowa:** `{}` (brak parametrów)

**Zachowanie:** GET na URL ZIP → rozpakowuje adm-zip → konkatenuje tekst wszystkich plików

**Zwraca:** Połączoną treść wszystkich notatek z nagłówkami plików

### 3.2 `filesystem_api`

**Opis:** Wrapper na verifyAnswer. Obsługuje tryb pojedynczy i batch.

**Schema wejściowa:**

```json
{
  "actions": { "action": "string", "path?": "string", "content?": "string" } | Array<...>
}
```

**Zachowanie:** Przekazuje actions jako answer do verifyAnswer. Akcje: help, reset, createDir, createFile, listDir, deleteFile, done.

---

## 4. Przepływ Wykonania

```
START
  ├─ 1. download_notes → odczytaj notatki Natana
  ├─ 2. filesystem_api({ action: "help" }) → poznaj API
  ├─ 3. Analiza LLM: wyodrębnij miasta, osoby, towary
  ├─ 4. filesystem_api({ action: "reset" }) → wyczyść stan
  ├─ 5. filesystem_api([createDir x3, createFile xN]) → batch
  ├─ 6. filesystem_api({ action: "done" }) → weryfikacja → flaga
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
    filesystem-api.ts   # Wrapper na filesystem API
    verify.ts           # (nieużywany, zastąpiony przez filesystem-api)
```
