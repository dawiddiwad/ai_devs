# Chaotyczny Szum Eterowy `radiomonitoring`

## 1. Ekspozycja i Cel Konstrukcji

### Summa Technologiae Misji

Zadaniem Automatu jest pochwycenie efemerycznych drgań elektromagnetycznych, emitowanych przez nadajnik w ustroniu zwanym Domatowem. Należy przesiać ten kosmiczny ściek, oddzielić ziarno sensu od plew entropii i wydobyć z mroków niepamięci cztery kardynalne atrybuty grodu "Syjon": jego miano właściwe, miarę powierzchniową, liczebność składów towarowych oraz cyfrowy ciąg kontaktowy.

### Parametry Inicjalne Matrycy

| Pole Bitowe | Desygnat              |
| ----------- | --------------------- |
| task        | `radiomonitoring`     |
| endpoint    | `HUB_ENDPOINT/verify` |
| apikey      | `AI_DEVS_API_KEY`     |

---

## 2. Ontologia Agenta i Strategia Algorytmiczna

### Manifest Rozumu Elektronowego (`prompts.ts`)

Oto instrukcje, które należy wyryć w krzemowej pamięci Agenta w języku uniwersalnym dla maszyn myślących:

```
You are an intelligence analyst intercepting radio transmissions.
Your mission: gather all signals first, then identify the city codenamed "Syjon".

## Workflow

1. Call listen() repeatedly until you receive "COLLECTION_COMPLETE"
2. Analyze all accumulated signals (text + images) to extract the 4 target fields
3. Call transmit() only when you have all 4 fields with high confidence

## Target Fields

- cityName: real Polish city name (not "Syjon")
- cityArea: area in km², rounded to exactly 2 decimal places, format "12.34"
- warehousesCount: number of warehouses (integer)
- phoneNumber: contact phone number (digits only, no separators)

## Rules

- Never call transmit() before COLLECTION_COMPLETE
- cityArea must be mathematically rounded, not truncated — exactly 2 decimal places
- If a field appears with conflicting values, prefer the most specific/explicit source
```

---

## 3. Architektura Systemu (Konstrukcja Maszyny)

Wykorzystujemy potęgę `runAgent`. Obrazy, owe piktograficzne cienie rzeczywistości, są automatycznie wtryskiwane w zwoje LLM jako bloki `image_url` przez rdzeń systemu.

```
src/
  index.ts        # Inicjacja iskry obliczeniowej → runAgent
  prompts.ts      # Instrukcje dla Rozumu Elektronowego (v. supra)
  tools/
    index.ts      # Instrumentarium [listen, transmit]
    listen.ts     # Percepcja szumu → obraz lub słowo
    transmit.ts   # Przesłanie Prawdy do Wielkiego Archiwum
```

---

## 4. Kinematyka Procesów (Przepływ Wykonania)

```
START
  ├─ 1. Przebudzenie Maszyny: axios POST {action:"start"}
  ├─ 2. Taniec runAgent('completions', [listen, transmit])
  │      Pętla Egzystencjalna:
  │      ├─ Wielokrotny nasłuch: listen()
  │      │     ├─ Głos w eterze         → zwróć tekst (string)
  │      │     ├─ Piktogram (image/*)   → zwróć AgentToolImageResult
  │      │     ├─ Manuskrypt (json/txt) → dekoduj z base64 do mowy ludzkiej
  │      │     ├─ Monstrum (byt wielki) → określ mianem "noise, skipped"
  │      │     └─ Sygnał Końca (!= 100) → "COLLECTION_COMPLETE"
  │      ├─ Agregacja wiedzy w pamięci operacyjnej
  │      └─ Finalny okrzyk: transmit({cityName, cityArea, ...})
  └─ KONIEC — verifyAnswer chwyta flagę i kładzie kres procesom.
```

---

## 5. Instrumentarium (Definicje Narzędzi)

### 5.1 `listen` (Ucho Eterowe)

**Cel:** Pochwycenie kolejnej emanacji sygnału z domatowskiego nadajnika.

**Router Percepcyjny:**

- Transkrypcja obecna → zwróć tekst.
- Meta `image/` → `AgentToolImageResult` (niech rdzeń zajmie się resztą).
- Meta `application/json` / `text` → Dekoduj lokalnie z base64 do stringa.
- Kod != 100 → „COLLECTION_COMPLETE”.

### 5.2 `transmit` (Głos Prawdy)

**Cel:** Przesłanie raportu końcowego o Syjonie.

**Wymogi formalne:** Wszystkie pola (cityName, cityArea, warehousesCount, phoneNumber) muszą być wypełnione zgodnie z rygorem matematycznym, inaczej Maszyna popadnie w błąd logiczny.

---

## 6. Przestrogi dla Konstruktorów (Znane Pułapki)

1. **Góra lodowa base64** — Nie przesyłaj surowego base64 jako sznura znaków! Rdzeń systemu domaga się `AgentToolImageResult`, by móc go właściwie przetrawić.
2. **Rygor Matematyczny** — Powierzchnia `cityArea` musi być zaokrąglona (`round`), a nie ucięta toporem ignorancji (`truncate`).
3. **Biały Szum** — Eter jest pełen bzdur. Pozwól Inteligencji Elektronowej przesiać te brednie samodzielnie – ona posiada filtry, o jakich nie śniło się waszym filozofom.
4. **Cisza po burzy** — Kod inny niż 100 to znak, że nadajnik zamilkł. Należy wtedy zaprzestać pytań i przejść do syntezy.

---

## 7. Kanon Akceptacji (Kryteria Sukcesu)

- [ ] Obrazy i nagrania płyną w formacie binarnym `AgentToolImageResult`.
- [ ] Teksty i JSONy są wyłuskane z otuliny base64 przed podaniem ich Agentowi.
- [ ] Liczba powierzchniowa lśni rygorem dokładnie dwóch miejsc po przecinku.
- [ ] Flaga zostaje pochwycona przez automat `verifyAnswer`.
- [ ] Konstrukcja buduje się bez zgrzytów: `npm run build`.
