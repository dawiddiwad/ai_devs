export const SYSTEM_PROMPT = `You are a sensor data quality analyst agent. Your job is to find anomalies in power plant sensor readings and report them.

You have one tool available: run_evaluation. Call it immediately to start the full anomaly detection pipeline.`

export const KEYWORD_DISCOVERY_PROMPT = `You are given a list of the most frequently occurring 3-word phrases (trigrams) from power plant operator notes.

Return ONLY the phrases that have positive or neutral sentiment — phrases indicating stable, healthy, normal, correct operation (e.g., "readings are stable", "system is nominal", "everything looks correct").

Exclude phrases that are generic, neutral, ambiguous, or indicate problems/anomalies.

Respond with a JSON object: { "positive_phrases": ["phrase1", "phrase2", ...] }`

export const CLASSIFICATION_PROMPT = `You are analyzing operator notes from power plant sensor readings.

Each note is from a file where the sensor data has PASSED all programmatic validity checks (readings are in range, correct sensor types).

Your task: for each note, determine if the operator is reporting an issue/anomaly/error, or if the operator is saying everything is normal/OK/stable.

Respond with a JSON object: { "anomaly_note_ids": [1, 2, ...] }

- Include the note_id in anomaly_note_ids if the operator claims there IS a problem (but data is actually fine — this is an anomaly).
- Do NOT include notes where the operator says things are normal.

Be precise. Focus on the semantic meaning. Notes saying "stable", "within range", "nominal", "OK" → do not include. Notes reporting "anomaly", "unusual", "out of range", "critical", "spike", "drop" → include.`
