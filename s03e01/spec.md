# AI Agent for Sensor Anomaly Detection (evaluation)

## 1. Overview & Goal

### Task Summary

The agent must download 10,000 sensor JSON files from a ZIP archive, detect anomalies in the data, and submit the list of anomalous file IDs to the **_hub_endpoint_**/verify endpoint. Anomalies include out-of-range sensor readings, sensors reporting data they shouldn't, and mismatches between operator notes and actual data validity.

### Hardcoded Inputs / Initial Data

| Field            | Value                                 |
| ---------------- | ------------------------------------- |
| Sensors Data URL | `**_hub_endpoint_**/dane/sensors.zip` |
| Task Name        | `evaluation`                          |
| Verify Endpoint  | **_hub_endpoint_**/verify             |
| Local cache dir  | `data/`                               |

### Valid Sensor Ranges

| Measurement        | Min   | Max   |
| ------------------ | ----- | ----- |
| temperature_K      | 553   | 873   |
| pressure_bar       | 60    | 160   |
| water_level_meters | 5.0   | 15.0  |
| voltage_supply_v   | 229.0 | 231.0 |
| humidity_percent   | 40.0  | 80.0  |

### Anomaly Definitions

1. **Range violation**: An active sensor reading is outside its valid range.
2. **Type violation**: A sensor field is non-zero but its type is NOT listed in `sensor_type` (e.g., water sensor reports voltage).
3. **False-positive operator note**: Data is valid (passes all programmatic checks) but the operator note claims there are errors/issues.
4. **False-negative operator note**: Data is invalid (fails programmatic checks) but the operator note says everything is OK. (These files are already captured by #1 or #2 — the note mismatch is supplementary.)

### Final Deliverable

A POST request to the verify endpoint with:

```json
{
	"apikey": "<AI_DEVS_API_KEY>",
	"task": "evaluation",
	"answer": {
		"recheck": ["0001", "0002", "..."]
	}
}
```

The flag returned in the response must be captured programmatically (regex parse), logged, and the process must exit with code 0.

---

## 2. Agent Persona & Prompt Strategy

### System Prompt (for the outer agent loop)

```markdown
You are a sensor data quality analyst agent. Your job is to find anomalies in power plant sensor readings and report them.

You have one tool available: run_evaluation. Call it immediately to start the full anomaly detection pipeline.
```

### Keyword Discovery Prompt (used internally by operator_anomalies Phase 1)

```markdown
You are given a list of the most frequently occurring 2-word phrases (bigrams) from power plant operator notes.

Return ONLY the phrases that have positive or neutral sentiment — phrases indicating stable, healthy, normal, correct operation (e.g., "readings are stable", "system is nominal", "everything looks correct").

Exclude phrases that are generic, ambiguous, or indicate problems/anomalies.

Respond with a JSON object: { "positive_phrases": ["phrase1", "phrase2", ...] }
```

### Classification Prompt (used internally by operator_anomalies Phase 2)

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

## 3. Tool Definitions (Function Calls)

The agent exposes a single tool to the LLM. Internally, the tool auto-chains 4 steps: download → sensor_anomalies → operator_anomalies → verify_result.

### 3.1 `run_evaluation`

**Description:** Runs the full sensor anomaly detection pipeline: downloads data, runs programmatic sensor checks, classifies operator notes via LLM, merges all anomaly IDs, and submits to the verify endpoint. Returns the final result.

**Input Schema:**

```json
{
	"type": "object",
	"properties": {},
	"required": []
}
```

**Internal Pipeline:**

1. **Download & Extract** — Downloads `sensors.zip`, extracts all JSON files into `data/`.
2. **Sensor Anomalies** — Programmatic validation (range + type checks). Produces Set A and caches normal records.
3. **Operator Anomalies** — LLM-based keyword discovery + note classification. Produces Set B.
4. **Verify Result** — Merges Set A ∪ Set B (deduplicated, sorted), POSTs to the verify endpoint.

**Exit behavior:**

- If the verify response contains a flag (`{{FLG:...}}`): log it and `process.exit(0)`.
- If no flag: log the hub response and `process.exit(1)`.

---

### Internal Step Details

#### Download & Extract

1. If `data/` directory exists, delete it to clear stale data.
2. Create a fresh `data/` directory.
3. Download `sensors.zip` using axios.
4. Extract all `.json` files into `data/`.

#### Sensor Anomalies

2. Parse `sensor_type` to determine active sensors (split by `/`, normalized and sorted).
3. Map sensor types to their measurement fields:
   - `temperature` → `temperature_K`
   - `pressure` → `pressure_bar`
   - `water` → `water_level_meters`
   - `voltage` → `voltage_supply_v`
   - `humidity` → `humidity_percent`
4. **Range check**: For each active sensor field, verify the reading is within valid range.
5. **Type check**: For each inactive sensor field (not in `sensor_type`), verify the value is 0.
6. Files failing validation → anomaly Set A. Files passing → normal data (held in memory for `operator_anomalies`).
7. Return anomaly IDs, counts, and sensor type group breakdown.

**Return value:**

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

#### Operator Anomalies

Analyzes operator notes from sensor-valid files using LLM classification. Uses a data-driven bigram discovery approach to filter out clearly-normal notes before sending the remaining (potentially negative) notes to the LLM. Each note is processed individually (1:1 with its file ID — no deduplication).

#### Phase 1: Data-Driven Positive Bigram Discovery

1. Use the normal data cached in memory by the preceding `sensor_anomalies` call.
2. Extract all operator note texts from the normal (sensor-valid) files.
3. Tokenize all notes into words (lowercase, strip punctuation).
4. Extract bigrams (2-word sliding windows) from each note's tokens.
5. Count bigram frequencies across the entire note corpus.
6. Take the top `NGRAM_CANDIDATES_COUNT` (default: 150) most frequent bigrams.
7. Send these bigrams to the LLM with a prompt asking it to return only the **positive-sentiment phrases** (phrases indicating normal/healthy/stable operation).
8. Use zod to validate the LLM response schema (`{ positive_phrases: string[] }`).
9. Take up to `POSITIVE_NGRAM_FILTER_COUNT` (default: all returned, capped at `NGRAM_CANDIDATES_COUNT`) positive-sentiment bigrams as the filter set.
10. Log the discovered filter phrases via `logger.tool`.

#### Phase 2: Filter & Classify

11. **Pre-filter**: For each note, extract its bigrams and check if any match the positive phrase set. Notes containing at least one positive bigram are filtered out. Notes with no matching positive bigrams are kept for LLM analysis.
12. Build a `NoteEntry` per remaining record: `{ note_id, text, file_id }` (1:1 — each entry maps to exactly one file).
13. If notes exceed 8000, log an error and exit (safety guard).
14. Split notes into batches of up to 1000 and send each batch to OpenAI for classification.
15. Use zod to validate the response schema (`anomaly_note_ids: number[]`).
16. Collect file IDs for all entries whose `note_id` is flagged → Set B.
17. Return Set B.

#### Constants (defined in code, not .env)

| Constant                      | Default                | Purpose                                                  |
| ----------------------------- | ---------------------- | -------------------------------------------------------- |
| `NGRAM_SIZE`                  | 2                      | Size of n-grams (bigrams)                                |
| `NGRAM_CANDIDATES_COUNT`      | 150                    | How many top-frequency bigrams to send to the LLM        |
| `POSITIVE_NGRAM_FILTER_COUNT` | NGRAM_CANDIDATES_COUNT | How many positive bigrams to use for pre-filtering       |
| `BATCH_SIZE`                  | 1000                   | Max notes per LLM classification batch                   |
| `MAX_NOTES_FOR_LLM`           | 8000                   | Safety guard — exit if more notes remain after filtering |

**Return value (internal):**

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

#### Verify Result

Submits the combined list of anomalous file IDs to the **_hub_endpoint_**/verify endpoint.

1. Build the payload: `{ apikey, task: "evaluation", answer: { recheck: anomaly_ids } }`.
2. POST to the verify endpoint (from config) with `validateStatus: () => true` to always get a response.
3. Parse the response body for a flag using regex (e.g., `{{FLG:...}}`).
4. If flag found: log it and exit process with code 0.
5. If no flag: log the full response and exit process with code 1.

---

## 4. Execution Flow

```text
START
  │
  ├─ 1. Agent (LLM) receives system prompt + user message
  │     └─ LLM calls `run_evaluation` tool
  │
  ├─ 2. run_evaluation auto-chains internally:
  │     ├─ Step 1: download_and_extract → fresh ZIP, extracts to data/
  │     ├─ Step 2: sensor_anomalies → programmatic checks → Set A
  │     ├─ Step 3: operator_anomalies → LLM note classification → Set B
  │     ├─ Step 4: merge Set A ∪ Set B (deduplicated, sorted)
  │     └─ Step 5: verify_result → POST to /verify
  │
  ├─ Flag found → log + process.exit(0)
  └─ No flag   → log response + process.exit(1)
```

### Key Decision Points

- **Single tool call**: The LLM makes exactly one tool call (`run_evaluation`). All pipeline steps are auto-chained inside the tool — no multi-step agent loop.
- **Fresh data**: Always re-downloads the ZIP to ensure the latest dataset.
- **Data-driven pre-filtering**: Discovers positive-sentiment bigrams (2-word phrases) from note corpus via word frequency + LLM classification, then uses them to filter out clearly-normal notes. Bigrams capture phrase-level meaning better than individual words (e.g., "not stable" won't falsely match).
- **Non-matching notes always analyzed**: Notes that contain none of the positive bigrams are always sent to the LLM.
- **Batching**: Notes are split into batches of 1000 for classification.
- **Normal data handoff**: `sensor_anomalies` stores valid records in module-level memory; `operator_anomalies` reads from it directly.
- **Flag capture**: Parsed via regex (not LLM). Process terminates immediately on capture (exit 0) or on failure (exit 1).
- **validateStatus**: The verify endpoint POST uses `validateStatus: () => true` to always receive the response body (flag may be in error responses).

---

## 5. Dependencies & Environment

### package.json additions

| Package   | Purpose                                             |
| --------- | --------------------------------------------------- |
| `adm-zip` | Extract files from sensors.zip (pure JS, no native) |

Existing packages are sufficient: `openai`, `axios`, `zod`, `dotenv`.

### Environment Variables (`.env`)

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
  index.ts                    # Entry point — bootstraps the agent
  agent.ts                    # Single LLM call to trigger the tool
  tools/
    download.ts               # download_and_extract step
    sensor-anomalies.ts       # sensor_anomalies step
    operator-anomalies.ts     # operator_anomalies step (LLM classification)
    verify-result.ts          # verify_result step
  tools.ts                    # Tool registry — defines single run_evaluation tool, auto-chains pipeline
  prompts.ts                  # System prompt and classification prompt templates
  config.ts                   # Environment variables
  logger.ts                   # Structured logging
data/                         # Cached sensor JSON files (gitignored)
```

---

## 6. Key Implementation Notes

1. **Sensor type → field mapping**: The `sensor_type` field contains active sensor names separated by `/`. Map each to its corresponding measurement field. Only those fields may be non-zero; all others MUST be 0.

2. **Data-driven note pre-filtering**: `operator_anomalies` builds its filter dynamically using bigrams (2-word phrases): it tokenizes all notes, extracts bigrams via a sliding window, counts bigram frequencies, takes the top 150 most frequent, asks the LLM which are positive-sentiment, and uses all returned positive bigrams as a filter. Notes containing at least one positive bigram are excluded; notes with no matching positive bigrams are always sent to the LLM. The constants `NGRAM_CANDIDATES_COUNT` (150), `POSITIVE_NGRAM_FILTER_COUNT` (all), `NGRAM_SIZE` (2), `BATCH_SIZE` (1000), and `MAX_NOTES_FOR_LLM` (8000) are configurable in code but not exposed to `.env`.

3. **OpenAI tool call type narrowing**: The openai v6 SDK returns a union type `ChatCompletionMessageFunctionToolCall | ChatCompletionMessageCustomToolCall`. Narrow the type by checking `type === 'function'` before accessing `function.name` and `function.arguments`.

4. **Zod validation**: Use zod schemas for:
   - Sensor JSON file parsing (validate structure of each file)
   - Tool input validation (validate arguments passed by the agent)
   - LLM classification response parsing (validate the JSON array returned by the classify_notes internal LLM call)

5. **Flag capture**: Parse the flag from the /verify response using regex pattern `/\{\{FLG:.*?\}\}/` or similar. Log it immediately via `logger.agent` and call `process.exit(0)`. If no flag, log the response and call `process.exit(1)`.

6. **Batch size for classification**: Notes are split into batches of 1000 before sending to OpenAI. A safety guard exits the process if more than 8000 notes remain after pre-filtering. The classification prompt asks for minimal JSON output to keep output token costs low.

7. **Bigram discovery LLM call**: The positive bigram discovery is a single, cheap LLM call (input: ~150 bigrams, output: subset of positive phrases). Use the same model as classification. The prompt asks: "From this list of 2-word phrases, return only the ones with positive/normal sentiment. Return as a JSON object with a `positive_phrases` array."

8. **Error handling for API calls**: Implement retry logic with exponential backoff for OpenAI and **_hub_endpoint_** API calls. Use `logger.api` for all external API interactions.

9. **Data directory**: Add `data/` to `.gitignore`. The download tool should create it if it doesn't exist.

10. **Agent loop termination**: The pipeline is auto-chained — no multi-step agent loop. The LLM makes a single tool call (`run_evaluation`), and the tool handles the entire workflow. On flag capture: `process.exit(0)`. On failure: `process.exit(1)`.

---

## 7. Acceptance Criteria

- [ ] Agent always downloads fresh sensors.zip (no caching)
- [ ] Programmatic analysis correctly identifies range violations
- [ ] Programmatic analysis correctly identifies sensor type mismatches (inactive sensor fields ≠ 0)
- [ ] Positive bigram discovery: tokenizes notes, extracts bigrams, finds top 150, classifies via LLM, uses all positive bigrams for filtering
- [ ] Operator notes are pre-filtered using data-driven positive bigrams (not hardcoded words)
- [ ] Notes without any positive bigrams are always sent to LLM for classification
- [ ] LLM classification correctly identifies notes claiming issues on valid data
- [ ] All anomaly IDs (programmatic + note-based) are merged and submitted
- [ ] Flag is captured programmatically via regex (not LLM)
- [ ] Flag is logged and process exits with code 0 on success, code 1 on failure
- [ ] All logging follows the 3-category structure (agent/tool/api) from logger.ts
- [ ] No hardcoded API keys or URLs — all from environment variables
- [ ] OpenAI tool calls use ChatCompletionTool type with zod-validated schemas
- [ ] Cost-efficient: LLM is only used for keyword discovery + note classification, not for data validation
- [ ] Filter constants (NGRAM_CANDIDATES_COUNT, POSITIVE_NGRAM_FILTER_COUNT, NGRAM_SIZE, BATCH_SIZE, MAX_NOTES_FOR_LLM) are configurable in code
- [ ] Single tool call architecture: LLM calls `run_evaluation` once, pipeline auto-chains internally
- [ ] Verify endpoint uses `validateStatus: () => true` to capture response regardless of HTTP status
