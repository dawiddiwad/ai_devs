# AI Agent for Sensor Anomaly Detection (evaluation)

## 1. Overview

Download 10,000 sensor JSON files from a ZIP archive, detect anomalies, and submit anomalous file IDs to the verify endpoint. Anomalies include out-of-range sensor readings, sensors reporting data they shouldn't, and mismatches between operator notes and actual data validity.

### Inputs

| Field            | Value                                 |
| ---------------- | ------------------------------------- |
| Sensors Data URL | `**_hub_endpoint_**/dane/sensors.zip` |
| Task Name        | `evaluation`                          |
| Verify Endpoint  | `**_hub_endpoint_**/verify`           |
| Local cache dir  | `data/`                               |

### Valid Sensor Ranges

| Field                | Min   | Max   |
| -------------------- | ----- | ----- |
| `temperature_K`      | 553   | 873   |
| `pressure_bar`       | 60    | 160   |
| `water_level_meters` | 5.0   | 15.0  |
| `voltage_supply_v`   | 229.0 | 231.0 |
| `humidity_percent`   | 40.0  | 80.0  |

### Anomaly Types

| #   | Name                         | Condition                                                                                         |
| --- | ---------------------------- | ------------------------------------------------------------------------------------------------- |
| 1   | Range violation              | Active sensor reading is outside its valid range                                                  |
| 2   | Type violation               | Inactive sensor field (not in `sensor_type`) has a non-zero value                                 |
| 3   | False-positive operator note | Data passes all checks, but the operator note claims an error exists                              |
| 4   | False-negative operator note | Data fails checks, but the operator note says everything is OK _(supplementary to types 1 and 2)_ |

### Final Deliverable

POST to the verify endpoint:

```json
{
	"apikey": "<AI_DEVS_API_KEY>",
	"task": "evaluation",
	"answer": {
		"recheck": ["0001", "0002", "..."]
	}
}
```

Parse the flag from the response using regex, log it, and `process.exit(0)`.

---

## 2. Prompts

### System Prompt _(outer agent)_

```markdown
You are a sensor data quality analyst agent. Your job is to find anomalies in power plant sensor readings and report them.

You have one tool available: run_evaluation. Call it immediately to start the full anomaly detection pipeline.
```

### Trigram Discovery Prompt _(operator_anomalies — Phase 1)_

```markdown
You are given a list of the most frequently occurring 3-word phrases (trigrams) from power plant operator notes.

Return ONLY the phrases that have positive or neutral sentiment — phrases indicating stable, healthy, normal, correct operation (e.g., "readings are stable", "system is nominal", "everything looks correct").

Exclude phrases that are generic, ambiguous, or indicate problems/anomalies.

Respond with a JSON object: { "positive_phrases": ["phrase1", "phrase2", ...] }
```

### Classification Prompt _(operator_anomalies — Phase 2)_

```markdown
You are analyzing operator notes from power plant sensor readings.

Each note is from a file where the sensor data has PASSED all programmatic validity checks (readings are in range, correct sensor types).

Your task: for each note, determine if the operator is reporting an issue/anomaly/error, or if the operator is saying everything is normal/OK/stable.

Respond with a JSON array of objects: { "note_id": <number>, "has_issue_claim": true/false }

- `has_issue_claim: true` means the operator claims there IS a problem (but data is actually fine — this is an anomaly).
- `has_issue_claim: false` means the operator says things are normal.

Be precise. Focus on the semantic meaning. Notes saying "stable", "within range", "nominal", "OK" → false. Notes reporting "anomaly", "unusual", "out of range", "critical", "spike", "drop" → true.
```

---

## 3. Pipeline

The LLM makes **one tool call** (`run_evaluation`). The tool auto-chains all steps internally.

```text
START
  │
  ├─ Agent receives system prompt → LLM calls run_evaluation
  │
  └─ run_evaluation chains:
       ├─ Step 1: download_and_extract  → fresh data/
       ├─ Step 2: sensor_anomalies      → Set A (programmatic)
       ├─ Step 3: operator_anomalies    → Set B (LLM notes)
       ├─ Step 4: merge Set A ∪ Set B   → deduplicated, sorted
       └─ Step 5: verify_result         → POST to /verify

  ├─ Flag found → log + process.exit(0)
  └─ No flag   → log response + process.exit(1)
```

### `run_evaluation` tool schema

```json
{
	"type": "object",
	"properties": {},
	"required": []
}
```

---

## 4. Step Details

### Step 1 — Download & Extract

1. Delete `data/` if it exists (clear stale data).
2. Create a fresh `data/` directory.
3. Download `sensors.zip` via axios.
4. Extract all `.json` files into `data/`.

---

### Step 2 — Sensor Anomalies

Produces **Set A**: files with range or type violations.

**Sensor type → field mapping** (the `sensor_type` field is `/`-delimited):

| Type          | Field                |
| ------------- | -------------------- |
| `temperature` | `temperature_K`      |
| `pressure`    | `pressure_bar`       |
| `water`       | `water_level_meters` |
| `voltage`     | `voltage_supply_v`   |
| `humidity`    | `humidity_percent`   |

**Checks per file:**

- **Range check** — for each field listed in `sensor_type`, the reading must be within the valid range.
- **Type check** — for each field _not_ listed in `sensor_type`, the value must be `0`.

Files failing any check → Set A. Files passing → cached in memory for Step 3.

**Return shape:**

```json
{
	"anomaly_ids": ["0001", "0042", "..."],
	"anomaly_count": 150,
	"normal_count": 9850,
	"total_files": 10000,
	"type_groups": { "humidity/temperature": 3000, "pressure": 1500 }
}
```

---

### Step 3 — Operator Anomalies

Produces **Set B**: sensor-valid files whose operator note falsely claims an issue. Each note maps 1:1 to its file ID (no deduplication).

#### Phase 1 — Positive Trigram Discovery

Goal: build a filter set of phrases that indicate "everything is normal."

1. Load normal records from memory (output of Step 2).
2. Tokenize all operator notes (lowercase, strip punctuation).
3. Extract trigrams (3-word sliding windows) from each note.
4. Count trigram frequencies across the full corpus.
5. Take the top `NGRAM_CANDIDATES_COUNT` (default: 150) trigrams.
6. Send to LLM → receive `positive_phrases` (zod-validated).
7. Use all returned phrases (up to `POSITIVE_NGRAM_FILTER_COUNT`) as the filter set.
8. Log the filter phrases via `logger.tool`.

#### Phase 2 — Filter & Classify

9. **Pre-filter**: discard any note containing at least one positive-phrase trigram. Notes with _no_ matches go to the LLM.
10. Build `NoteEntry[]`: `{ note_id, text, file_id }` for each remaining note.
11. If remaining notes exceed `MAX_NOTES_FOR_LLM` (2000) → log error and exit.
12. Split into batches of `BATCH_SIZE` (1000) and POST each batch to OpenAI.
13. Zod-validate response (`anomaly_note_ids: number[]`).
14. Map flagged `note_id`s back to `file_id`s → Set B.

#### Constants _(in code, not `.env`)_

| Constant                      | Default                  | Purpose                                               |
| ----------------------------- | ------------------------ | ----------------------------------------------------- |
| `NGRAM_SIZE`                  | `3`                      | N-gram size (spec uses trigrams = 3-word phrases)     |
| `NGRAM_CANDIDATES_COUNT`      | `150`                    | Top-frequency trigrams sent to LLM                    |
| `POSITIVE_NGRAM_FILTER_COUNT` | `NGRAM_CANDIDATES_COUNT` | Max positive trigrams used for pre-filtering          |
| `BATCH_SIZE`                  | `1000`                   | Max notes per classification batch                    |
| `MAX_NOTES_FOR_LLM`           | `2000`                   | Safety guard — exit if more notes remain after filter |

**Return shape:**

```json
{
	"anomaly_ids": ["0010", "0055", "..."],
	"anomaly_count": 12,
	"notes_analyzed": 450,
	"notes_filtered_out": 9400,
	"positive_keywords": ["looks clean", "smooth and", "and stable", "normal mode", "no irregular"],
	"total_files_analyzed": 9850
}
```

---

### Step 4 — Merge

Combine Set A ∪ Set B: deduplicate and sort numerically.

---

### Step 5 — Verify Result

1. Build payload: `{ apikey, task: "evaluation", answer: { recheck: anomaly_ids } }`.
2. POST to the verify endpoint with `validateStatus: () => true` (always read the response body).
3. Parse response for a flag: `/\{\{FLG:.*?\}\}/`.
4. Flag found → log via `logger.agent` + `process.exit(0)`.
5. No flag → log full response + `process.exit(1)`.

---

## 5. Implementation Notes

**Sensor type parsing** — `sensor_type` is `/`-delimited. Active fields may be non-zero; _all other fields must be exactly `0`_.

**Trigram filter rationale** — 3-word phrases avoid false positives from single words (e.g., "not stable" won't match a filter built on "stable" alone).

**OpenAI type narrowing** — The v6 SDK returns `ChatCompletionMessageFunctionToolCall | ChatCompletionMessageCustomToolCall`. Check `type === 'function'` before accessing `function.name` / `function.arguments`.

**Zod usage** — Validate: sensor JSON file structure, tool input arguments, LLM classification responses, and bigram discovery responses.

**Flag regex** — `/\{\{FLG:.*?\}\}/`. Log immediately via `logger.agent` on match.

**Retry logic** — Implement exponential backoff for OpenAI and hub API calls. Use `logger.api` for all external API interactions.

**Data directory** — Add `data/` to `.gitignore`.

---

## 6. Dependencies & Environment

**New dependency:** `adm-zip` (pure JS ZIP extraction, no native bindings).  
Existing packages cover everything else: `openai`, `axios`, `zod`, `dotenv`.

### `.env`

```env
OPENAI_API_KEY=your-openai-api-key-here
OPENAI_MODEL=gpt-5-nano
AI_DEVS_API_KEY=your-ai-devs-api-key-here
AI_DEVS_TASK_NAME=evaluation
AI_DEVS_HUB_ENDPOINT=hub_base_url
```

### Project Structure

```text
src/
  index.ts               # Entry point — bootstraps the agent
  agent.ts               # Single LLM call to trigger the tool
  tools/
    download.ts          # Step 1: download_and_extract
    sensor-anomalies.ts  # Step 2: sensor_anomalies
    operator-anomalies.ts # Step 3: operator_anomalies (LLM classification)
    verify-result.ts     # Step 5: verify_result
  tools.ts               # Tool registry — run_evaluation, auto-chains pipeline
  prompts.ts             # System prompt and classification prompt templates
  config.ts              # Environment variable loading
  logger.ts              # Structured logging (agent / tool / api)
data/                    # Extracted sensor JSON files (gitignored)
```

---

## 7. Acceptance Criteria

- [ ] Always downloads a fresh `sensors.zip` (no caching)
- [ ] Range violations correctly detected for all active sensor fields
- [ ] Type violations correctly detected (inactive field ≠ 0)
- [ ] Trigram discovery: tokenizes notes → top 150 → LLM classifies → positive phrases used as filter
- [ ] Pre-filter uses data-driven trigrams (not hardcoded words)
- [ ] Notes with no positive trigrams are always sent to LLM
- [ ] LLM classification correctly flags notes that claim issues on valid data
- [ ] Set A ∪ Set B merged, deduplicated, sorted, and submitted
- [ ] Flag captured via regex (not LLM); logged and `process.exit(0)` on success
- [ ] `process.exit(1)` on no flag
- [ ] All logging uses the 3-category structure: `agent` / `tool` / `api`
- [ ] No hardcoded API keys or URLs — all from environment variables
- [ ] `ChatCompletionTool` type used for tool definitions; zod validates all LLM I/O
- [ ] LLM used only for keyword discovery + note classification (not for data validation)
- [ ] Pipeline constants (`NGRAM_CANDIDATES_COUNT`, `POSITIVE_NGRAM_FILTER_COUNT`, `NGRAM_SIZE`, `BATCH_SIZE`, `MAX_NOTES_FOR_LLM`) are configurable in code
- [ ] Single tool call architecture: LLM calls `run_evaluation` once; pipeline auto-chains internally
- [ ] Verify POST uses `validateStatus: () => true`
