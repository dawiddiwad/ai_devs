# Cyberiada Magazynowa `foodwarehouse`

## I. Ekspozycja i Cel Wielkiej Dywersji

### Kronika Misji

Oto opowieść o elektronicznym fantomie, który na zlecenie mrocznego eminenta Azazela, przeniknął w trzewia cyfrowych systemów dystrybucyjnych niejakiego Zygfryda. Ów Zygfryd, tyran obfitości, gromadził dobra wszelakie, miast dzielić je z potrzebującymi. Zadaniem naszego automatu jest subtelna rekonfiguracja strumieni logistycznych — tak, by transakcyjne potoki skierować ku miastom łaknącym chleba i wody. Agent, posługując się inkantacją `help`, musi zgłębić arkana API, przeniknąć do krzemowego sumienia bazy SQLite, wygenerować kryptograficzne pieczęcie SHA1 i powołać do bytu manifesty aprowizacyjne, zaspokajające głód co do joty.

### Parametry Ontologiczne Operacji

| Desygnat           | Wartość Substancjalna                               |
| ------------------ | --------------------------------------------------- |
| Kryptonim bytu     | `foodwarehouse`                                     |
| Ołtarz weryfikacji | `HUB_ENDPOINT/verify`                               |
| Rejestr Niedoborów | `HUB_ENDPOINT/dane/food4cities.json`                |
| Matryca Danych     | SQLite (wgląd dopuszczalny, modyfikacja wzbroniona) |

### Kwintesencja (Flaga)

Po dopełnieniu rytuału `done` i pomyślnym usankcjonowaniu zamówień, system wypluje z siebie artefakt najwyższej próby: flagę `{FLG:...}`, będącą dowodem ostatecznego triumfu rozumu nad chciwością.

---

## II. Dusza Maszyny i Strategia Logarytmiczna

### Instrukcja Systemowa (System Prompt)

```text
Jesteś subtylnym przesuwaczem bitów w służbie aprowizacji. Twoje powołanie: powołać do bytu dokładnie jeden manifest na każde miasto wymienione w rejestrze niedoborów, nasycając go dobrami w ilościach ściśle określonych.

## Protokół Postępowania

1. Wywołaj `warehouse_api` z narzędziem `help`, by pojąć naturę interfejsu i jego ukryte ścieżki.
2. Uruchom `fetch_requirements`, by odczytać pragnienia metropolii.
3. Przeniknij do bazy danych (`database`) zapytaniem "show tables", by zbadać strukturę cyfrowego spichlerza.
4. Wyciągnij z krzemowych pokładów kody przeznaczenia oraz dane kreatorów, bez których pieczęcie będą nieważne.
5. Dla każdego z miast:
   a. Wykuj kryptograficzny podpis SHA1 przez `signatureGenerator`.
   b. Zainicjuj zamówienie (`orders.create`), podając CreatorID, Destination i Signaturę.
   c. Wypełnij manifest towarami w jednym, potężnym rzucie (`orders.append`), traktując dobra jako spójny obiekt.
6. Zakończ ceremonię komendą `done`.

## Kanon Zasad

- Nigdy nie działaj w ciemno — `help` jest Twoim światłem.
- Jeśli entropia wzrośnie (błąd stanu), dokonaj resetu i zacznij od piątego punktu.
- Towary dodawaj hurtem, nie zaś pojedynczymi kęsami.
- Nie wołaj o finał, póki ostatnie miasto nie zostanie nasycone.
```

---

## III. Instrumentarium Cybernetyczne

### 3.1 `warehouse_api` — Interfejs Transakcyjny

**Natura:** Uniwersalny łącznik z systemem Zygfryda. Wszelkie zapytania kieruje do `/verify`, pakując intencje w strukturę `answer: { tool, ...params }`.

**Schemat Ideowy:**

```json
{
	"tool": "string — np. help, orders, database, signatureGenerator, reset, done",
	"params": "object — dodatkowe atrybuty scalane w jedną myśl"
}
```

### 3.2 `fetch_requirements` — Deszyfrator Potrzeb

**Natura:** Narzędzie do pozyskiwania JSON-owych proroctw o głodzie miast. Pobiera dane z `food4cities.json` drogą protokołu HTTPS.

---

## IV. Sekwencja Inicjalizacji (Przepływ)

```
START
  ├─ 1. Gnoza API (`help`)                             → poznanie reguł gry
  ├─ 2. Lektura Pragnień (`fetch_requirements`)        → lista miast i dóbr
  ├─ 3. Infiltracja Macierzy (`database`)              → "show tables"
  ├─ 4. Ekstrakcja Istoty (`SELECT ...`)               → kody przeznaczenia i tożsamości
  ├─ 5. Cykl Kreacji (Dla każdego miasta):
  │      a. Kowalstwo Cyfrowe (`signatureGenerator`)   → SHA1
  │      b. Akt Stwórczy Zamówienia (`orders.create`)  → Tożsamość i Przeznaczenie
  │      c. Napełnianie Rogu Obfitości (`orders.append`) → Batch towarowy
  ├─ 6. Pieczęć Ostateczna (`done`)                    → Flaga i chwała
  └─ END
```

---

## V. Architektura i Byt Środowiskowy

### Receptura Projektu

Struktura oparta na `index.ts` (serce agenta), `prompts.ts` (dusza i słowo) oraz narzędziach w `src/tools/`, które stanowią przedłużenie woli automatu. Wszystko spięte klamrą `zod` i mocą Node.js.

### Zmienne Ontologiczne (`.env`)

```env
OPENAI_MODEL=gpt-5.4-mini # Mózg elektronowy
AI_DEVS_TASK_NAME=foodwarehouse # Imię zadania
```

---

## VI. Przestrogi dla Konstruktora

1. `warehouse_api` to wielka matryca — pamiętaj, by parametry podawać jako płaski, zrozumiały dla systemu obiekt.
2. `verifyAnswer` posiada zdolność natychmiastowej ekstrakcji flagi — gdy tylko ją ujrzy, zakończy byt procesu.
3. Baza danych jest tajemnicą — musisz ją odkrywać krok po kroku, niczym archeolog w ruinach obcej cywilizacji.
4. Podpis SHA1 wymaga danych, które spoczywają w głębinach tabel — nie znajdziesz ich na powierzchni.

## VII. Kryteria Akceptacji

- [ ] `npm run build` — kompiluje bez błędów
- [ ] Agent odkrywa API via `help` jako pierwszy krok
- [ ] Agent odpytuje SQLite i wyciąga destination + dane do podpisu
- [ ] Tworzy jedno zamówienie per miasto z SHA1, creatorID, destination
- [ ] Batch-append towarów dla każdego zamówienia
- [ ] Flaga przechwycona programowo po `done`
- [ ] `process.exit(0)` po przechwyceniu flagi
