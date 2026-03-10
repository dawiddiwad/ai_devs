## Zadanie

Pobierz listę osób, które przeżyły 'Wielką Korektę' i które współpracują z systemem. Znajdziesz ją w `input/people.csv`

Wiemy, że do organizacji transportów między elektrowniami angażowani są ludzie, którzy:

- są mężczyznami, którzy teraz w 2026 roku mają między 20, a 40 lat
- urodzonych w Grudziądzu
- pracują w branży transportowej

Każdą z potencjalnych osób musisz odpowiednio otagować. Mamy do dyspozycji następujące tagi:

- IT
- transport
- edukacja
- medycyna
- praca z ludźmi
- praca z pojazdami
- praca fizyczna

Jedna osoba może mieć wiele tagów. Nas interesują tylko ludzie pracujący w transporcie, którzy spełniają też poprzednie warunki.

Nazwa zadania to: **people**.

```json
{
       "apikey": "tutaj-twój-klucz-api",
       "task": "people",
       "answer": [
         {
           "name": "Jan",
           "surname": "Kowalski",
           "gender": "M",
           "born": 1987,
           "city": "Warszawa",
           "tags": ["tag1", "tag2"]
         },
         {
           "name": "Anna",
           "surname": "Nowak",
           "gender": "F",
           "born": 1993,
           "city": "Grudziądz",
           "tags": ["tagA", "tagB", "tagC"]
         }
       ]
     }
```

### Co należy zrobić w zadaniu?

1. **Pobierz dane z hubu** - plik `people.csv` znajduje się w `input/people.csv`. Plik zawiera dane osobowe wraz z opisem stanowiska pracy (`job`).
2. **Przefiltruj dane** - zostaw wyłącznie osoby spełniające wszystkie kryteria: płeć, miejsce urodzenia, wiek.
3. **Otaguj zawody modelem językowym** - wyślij opisy stanowisk (`job`) do LLM i poproś o przypisanie tagów z listy dostępnej w zadaniu. Użyj mechanizmu Structured Output, aby wymusić odpowiedź modelu w określonym formacie JSON. Szczegóły we Wskazówkach.
4. **Wybierz odpowiednie osoby** - z otagowanych rekordów wybierz wyłącznie te z tagiem `transport`.
5. **Stwórz plik docelowy w `output/transport.csv`**

### Wskazówki

- **Structured Output - cel i sposób użycia:** Celem zadania jest zastosowanie mechanizmu Structured Output przy klasyfikacji zawodów przez LLM. Polega on na wymuszeniu odpowiedzi modelu w ściśle określonym formacie JSON przez przekazanie schematu (JSON Schema) w polu `response_format` wywołania API. Dokumentacja: [OpenAI](https://platform.openai.com/docs/guides/structured-outputs#supported-schemas), [Anthropic](https://platform.claude.com/docs/en/build-with-claude/structured-outputs), [Gemini](https://ai.google.dev/gemini-api/docs/structured-output?example=recipe). Zadanie da się rozwiązać bez Structured Output, na przykład prosząc model o zwrócenie JSON-a i parsując go ręcznie - ale Structured Output eliminuje całą klasę błędów. Możesz też użyć bibliotek jak **Instructor** ([Python](https://python.useinstructor.com/)/[JS/TypeScript](https://js.useinstructor.com/)), które obsługują ten mechanizm za Ciebie.
- **Batch tagging - jedno wywołanie dla wielu rekordów:** Zamiast wywoływać LLM osobno dla każdej osoby, możesz na przykład wysłać w jednym żądaniu ponumerowaną listę opisów stanowisk i poprosić o zwrócenie listy obiektów z numerem rekordu i przypisanymi tagami. Znacznie zredukuje to liczbę wywołań API.
- **Opisy tagów pomagają modelowi:** Do każdej kategorii dołącz krótki opis zakresu - pomaga to modelowi poprawnie sklasyfikować niejednoznaczne stanowiska.
- **Format pól w odpowiedzi:** Pole `born` to liczba całkowita (sam rok urodzenia). Pole `tags` to tablica stringów, nie jeden string z przecinkami.