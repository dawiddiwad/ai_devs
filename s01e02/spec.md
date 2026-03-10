## Zadanie

Musisz namierzyć, która z podejrzanych osób z poprzedniego zadania **przebywała blisko jednej z elektrowni atomowych.** Musisz także ustalić jej **poziom dostępu** oraz informację koło której elektrowni widziano tę osobę. Zebrane tak dane utwórz w `output/matched-suspect.json`. Nazwa zadania to **findhim**.

#### Skąd wziąć dane?

1. **Lista elektrowni + ich kody**
   - Pobierz JSON z listą elektrowni (wraz z kodami identyfikacyjnymi) z:
     - `https://hub.ag3nts.org/data/AI_DEVS_API_KEY/findhim_locations.json`

2. **Gdzie widziano konkretną osobę (lokalizacje)**

   - Endpoint: `https://hub.ag3nts.org/api/location`
   - Metoda: `POST`
   - Body: `raw JSON` (nie form-data!)
   - Zawsze wysyłasz pole `AI_DEVS_API_KEY` oraz dane osoby (`name`, `surname`)
   - Odpowiedź: lista współrzędnych (koordynatów), w których daną osobę widziano.

   Przykładowy payload:

   ```json
   {
     "apikey": "tutaj-twój-klucz",
     "name": "Jan",
     "surname": "Kowalski"
   }
   ```

3. **Jaki poziom dostępu ma wskazana osoba**

   - Endpoint: `https://hub.ag3nts.org/api/accesslevel`
   - Metoda: `POST`
   - Body: `raw JSON`
   - Wymagane: `apikey`, `name`, `surname` oraz `birthYear` (rok urodzenia bierzesz z danych z poprzedniego zadania, np. z CSV)

   Przykładowy payload:

   ```json
   {
     "apikey": "AI_DEVS_API_KEY",
     "name": "Jan",
     "surname": "Kowalski",
     "birthYear": 1987
   }
   ```

#### Co masz zrobić krok po kroku?

Dla każdej podejrzanej osoby:

1. Pobierz listę jej lokalizacji z `/api/location`.
2. Porównaj otrzymane koordynaty z koordynatami elektrowni z `findhim_locations.json`.
3. Jeśli lokalizacja jest bardzo blisko jednej z elektrowni — masz kandydata.
4. Dla tej osoby pobierz `accessLevel` z `/api/accesslevel`.
5. Zidentyfikuj **kod elektrowni** (format: `PWR0000PL`) i przygotuj raport.

#### Jak wysłać odpowiedź?

Wysyłasz ją metodą **POST** na `https://hub.ag3nts.org/verify`.

Nazwa zadania to: **findhim**.

Pole `answer` to **pojedynczy obiekt** zawierający:

- `name` – imię podejrzanego
- `surname` – nazwisko podejrzanego
- `accessLevel` – poziom dostępu z `/api/accesslevel`
- `powerPlant` – kod elektrowni z `findhim_locations.json` (np. `PWR1234PL`)

Przykład JSON do wysłania na `/verify`:

```json
{
  "apikey": "AI_DEVS_API_KEY",
  "task": "findhim",
  "answer": {
    "name": "Jan",
    "surname": "Kowalski",
    "accessLevel": 3,
    "powerPlant": "PWR1234PL"
  }
}
```

#### Nagroda

Jeśli Twoja odpowiedź będzie poprawna, Hub odeśle Ci flagę w formacie {FLG:JAKIES\_SLOWO}

### Wskazówki

- **Dane wejściowe z poprzedniego zadania** — lista podejrzanych znajduje się w `input/suspects.json`.
- **Obliczanie odległości geograficznej** — API zwraca współrzędne (latitude/longitude). Żeby sprawdzić, czy dana lokalizacja jest "bardzo blisko" elektrowni, użyj wzoru na odległość na kuli ziemskiej (np. [Haversine](https://en.wikipedia.org/wiki/Haversine_formula)). LLM pomoże Ci w napisaniu takiej funkcji. Szukamy osoby która była najbliżej którejś elektrowni.
- **Wykorzystaj Function Calling** — to technika, w której model LLM zamiast odpowiadać tekstem wywołuje zdefiniowane przez Ciebie funkcje (narzędzia). Opisujesz narzędzia w formacie JSON Schema (nazwa, opis, parametry), a model sam decyduje, które wywołać i z jakimi argumentami. Ty obsługujesz wywołania i zwracasz wyniki z powrotem do modelu. W tym zadaniu Function Calling sprawdza się szczególnie dobrze: agent może samodzielnie iterować przez listę podejrzanych, odpytywać kolejne endpointy i wysłać gotową odpowiedź — bez sztywnego kodowania kolejności kroków w kodzie.
- **Format `birthYear`** — endpoint `/api/accesslevel` oczekuje roku urodzenia jako liczby całkowitej (np. `1987`). Jeśli Twoje dane zawierają pełną datę (np. `"1987-08-07"`), pamiętaj o wyciągnięciu samego roku przed wysłaniem żądania.
- **Zabezpieczenie pętli agenta** — jeśli stosujesz podejście agentowe z Function Calling, ustal maksymalną liczbę iteracji (np. 10-15), żeby uchronić się przed nieskończoną pętlą w razie błędu modelu.

### Architektura
- Podziel kod na logiczne moduły, nie trzymaj wszystkiego w index.ts
- Utwórz osobne obiekty dla pobierania, przetwarzania i wysylania danych oraz ostatecznej weryfikacji
- Proces powinien być dynamiczny i poza pobraniem listy podejrzanych z folderu input, powinien pobierac za kazdym razem nowe dane

### AI Agent
- stworz proces agenta ai, który będzie korzystał z narzędzi [(tools w openai api) typu `function`](https://developers.openai.com/api/docs/guides/tools/?tool-type=function-calling), nawet jezeli to zadanie mozna obluzyc całkowicie w trybie offline.
- narzedzia powinny wywolywac istniejące obiekty do obslugi zadan i przetwarzania danych.
- pamiętaj, aby narzędzia obslugiwaly tablice danych w przypadku wielu rekordow, co pozwoli agentowi na uzycie narzedzia raz dla wielu podobnych akcji. Np sprawdzenie wielu lokalizacji dla tego samego podejrzanego

### Standardy
- Pisz kod po angielsku
- Użyj TypeScript.
- Użyj dotenv.
- Zastosuj zasady SOLID.
- Nie używaj komentarzy w kodzie.
- Korzystaj z OpenAI API poprzez pakiet npm openai.
- Korzystaj z Axios przez pakiet npm axios do obsługi zadan http.
- nie uzywaj średników na końcu linii ;