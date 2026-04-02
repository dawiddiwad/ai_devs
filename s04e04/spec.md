# Natanaaaaa? Czyli Cyber-Ontologia Plików `filesystem`

## 1. Przegląd i Cel Operacji

### Streszczenie Trudu

Nasz automat, ów krzemowy analityk, zostaje zmuszony do zanurzenia się w gęstej entropii zapisków niejakiego Natana (spoczywających w cyfrowym sarkofagu zwanym archiwum ZIP). Zadaniem golema jest autonomiczna ekstrakcja owych handlowych danych z plików o budowie wpół-strukturalnej. Większość maszynowej pracy, polegającej na przetrawieniu tego informacyjnego zgiełku, odbywa się w trzewiach narzędzi lokalnych (preprocessingu). Elektronowemu mózgowi (modelowi językowemu) pozostawiono zaś zadanie natury iście dedukcyjnej: niczym wytrawny badacz kosmicznych anomalii, musi poskładać brakujące imiona i nazwiska, dysponując zaledwie ułomkami poszlak.

### Parametry Brzegowe Rzeczywistości (Dane Wejściowe)

| Współrzędna Kosmiczna | Ekwiwalent Cyfrowy                                 |
| --------------------- | -------------------------------------------------- |
| Kryptonim misji       | `filesystem`                                       |
| Ołtarz weryfikacji    | `config.verifyEndpoint` (`HUB_ENDPOINT + /verify`) |
| Wektor notatek        | `HUB_ENDPOINT/dane/natan_notes.zip`                |
| Teleskop struktury    | `HUB_ENDPOINT/filesystem_preview.html`             |

### Artefakt

Flaga Prawdy `{FLG:...}`, wyłoniona przez algorytm ostateczny `done` po bezbłędnej weryfikacji nowo uformowanej galaktyki plików.

---

## 2. Prawa Robotyki i Strategia Intelektualna (Prompt)

### Świadomość Systemowa

Duch w maszynie, czyli Agent Analityczny. Reguły nakazane przez stwórcę są nieubłagane: obowiązuje kategoryczny zakaz stosowania znaków diakrytycznych (owej słowiańskiej fanaberii, gdzie ą musi ulec redukcji do a, niczym wymiary zwinięte w teorii strun), a także nakaz używania mianownika liczby pojedynczej dla wszelkich dóbr materialnych. Instrukcja operacyjna wymusza na sztucznej inteligencji oparcie się o lokalny aparat trawienny (preprocessing), manipulację na abstrakcyjnym uchwycie zwanym `datasetId` oraz użycie jednego tylko, ostatecznego demiurga do zatwierdzenia struktury.

---

## 3. Instrumentarium (Protezy Poznawcze)

### 3.1 `download_notes` (Zasysacz Eteru)

**Opis:** Ekstrahuje z cyberprzestrzeni i rozłupuje skompresowany wolumin (ZIP) skrywający chaotyczne myśli Natana.

**Schemat wejściowy:** `{}` (byt samoistny, niewymagający stymulacji parametrami)

**Zachowanie mechanizmu:** Impuls GET uderza w ZIP, moduł `adm-zip` dokonuje defragmentacji, a następnie splata całą tekstową materię plików w jeden nieprzerwany potok informacji.

**Zwraca:** Monolityczny tekst wszystkich zapisków, opatrzony metadanymi nagłówków.

### 3.2 `preprocess_notes` (Destylator Sensu)

**Opis:** Narzędzie to lokalnie przeżuwa notatki, odkłada ciężkie myśli w zakamarkach pamięci operacyjnej i przekazuje modelowi zaledwie destylat, małą pigułkę wiedzy.

**Schemat wejściowy:**

```json
{
	"rawNotesText": "string"
}
```

**Zachowanie mechanizmu:** Poprzez bezlitosną tokenizację, odcinanie końcówek (stemmer) i przybliżone dopasowania wzorców (fuzzy matching), rodzą się ustrukturyzowane informacje handlowe. Zostają one ukryte pod pieczęcią `datasetId`. Golem Wyższego Rzędu otrzymuje do rozmyślań zaledwie to:

```json
{
	"datasetId": "uuid",
	"resolvedPeople": { "miasto": "Imie Nazwisko" },
	"unresolvedPeople": [{ "city": "miasto", "names": [], "snippets": ["..."] }]
}
```

**Zwraca:** Asceza informacyjna. Minimalny ładunek niezbędny do dedukcji, pozbawiony szumu pełnych rozmów i zawiłych map kupieckich.

### 3.3 `submit_filesystem` (Kreator Bytów Katalogowych)

**Opis:** Chwyta `datasetId` pozostawione przez Destylator, dołącza doń wywnioskowaną przez elektronowy mózg listę `people`, po czym wprawia w ruch machinę stwórczą API systemu plików, resetuje dawny chaos i poddaje dzieło Sądowi Ostatecznemu (weryfikacji).

**Schemat wejściowy:**

```json
{
	"datasetId": "string",
	"people": [{ "city": "miasto", "person": "Imie Nazwisko" }]
}
```

**Zachowanie mechanizmu:** Automat ów samowolnie dokonuje oczyszczenia (`reset`), buduje w jednym akcie woli (batch) nowe podkatalogi i pliki (`createDirectory/createFile`), by na końcu dumnie obwieścić `done`.

---

## 4. Drabina Ewolucyjna (Przepływ Wykonania)

```text
POCZĄTEK ISTNIENIA
  ├─ 1. download_notes → wyssanie zapisków Natana z próżni
  ├─ 2. preprocess_notes(rawNotesText) → wygenerowanie datasetId oraz wyizolowanie zagadek (resolved/unresolved)
  ├─ 3. Kontemplacja LLM → syntetyzowanie brakujących tożsamości ludzkich na podstawie topograficznych poszlak
  ├─ 4. submit_filesystem(datasetId, people) → wielki reset, akt kreacji i finałowa pieczęć (done)
  └─ KONIEC PROCESU
```

---

## 5. Zależności i Materia Wszechświata (Środowisko)

### Biblioteki (Paczki Zasilające)

| Zespół Bytów   | Przeznaczenie w Maszynie                        |
| -------------- | ----------------------------------------------- |
| adm-zip        | Rozłupywanie wielowymiarowych archiwów ZIP      |
| @types/adm-zip | Ontologia typów dla rygorystycznego TypeScriptu |

### Zmienne Kosmiczne (Environment Variables)

```env
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-5-mini
AI_DEVS_API_KEY=...
AI_DEVS_TASK_NAME=filesystem
AI_DEVS_HUB_ENDPOINT=...
```

### Architektura Bytów (Struktura Projektu)

```text
src/
  index.ts              # Punkt osobliwości uruchamiający runAgent()
  prompts.ts            # Mantry Systemowe i zlecenia Użytkownika
  tools/
    index.ts            # Wielki Rejestr Instrumentarium
    download-notes.ts   # Moduł zasysający archiwum ZIP
    preprocess-notes.ts # Moduł destylacji i zapisu tymczasowego dla LLM
    submit-filesystem.ts # Ramię stwórcze: lokalny reset, batch i weryfikacja
    verify.ts           # (Skamielina ewolucyjna, wyparta przez filesystem-api)
```
