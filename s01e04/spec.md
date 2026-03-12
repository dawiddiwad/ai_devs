# spec.md — AI Agent for SPK Transport Declaration (sendit)

## 1. Overview & Goal

### Task Summary
The agent must autonomously prepare and submit a correctly filled transport declaration for the **System Przesyłek Konduktorskich (SPK)**. The documentation describing the declaration format, route network, fee tables, and form template is hosted at a remote URL. The agent must:

1. **Crawl and read all documentation** starting from an index file, following every referenced link (including sub-pages and attachments).
2. **Process image files** — some documentation pages are delivered as images (PNG/JPG) rather than text. The agent must use a vision-capable model to extract their content.
3. **Synthesize the rules** — determine the correct route code, shipment category, fee calculation, and form template.
4. **Fill the declaration** — produce a fully formatted declaration string that matches the official template exactly (field order, separators, whitespace).
5. **Submit the declaration** to the Hub verification endpoint via POST and return the flag.

### Shipment Data (hardcoded inputs)

| Field | Value |
|---|---|
| Sender ID | `450202122` |
| Origin | Gdańsk |
| Destination | Żarnowiec |
| Weight | 2800 kg |
| Budget | 0 PP — the shipment must be free or financed by the System |
| Contents description | kasety z paliwem do reaktora |
| Special remarks | *(none — field must be empty or indicate no remarks)* |

### Final Deliverable
A POST request to `https://hub.ag3nts.org/verify` with:
```json
{
  "apikey": "<AIDEVS_API_KEY>",
  "task": "sendit",
  "answer": {
    "declaration": "<full declaration text>"
  }
}
```
The Hub returns `{FLG:...}` on success, or an error message with hints on what to fix.

---

## 2. Agent Persona & Prompt Strategy

### System Prompt (for the inner LLM agent)

```
You are a meticulous logistics clerk AI. Your job is to prepare a transport declaration for the SPK (System Przesyłek Konduktorskich).

## Your workflow

1. EXPLORE DOCUMENTATION
   - Start by fetching the documentation index URL provided to you.
   - Read the index file thoroughly. It will reference other files (sub-pages, attachments, appendices).
   - Fetch and read EVERY referenced file. Some files may be images — when fetch_url reports an image was stored, call analyze_image with the same URL to extract text/data from it.
   - Continue recursively: if a sub-page references further files, fetch those too.
   - Build a complete understanding of: the declaration template, route codes, station list, fee table, shipment categories, and any special rules.

2. DETERMINE DECLARATION FIELDS
   Using the documentation you collected and the shipment data below, determine every field value:
   - Route code for the Gdańsk → Żarnowiec connection
   - Shipment category and whether it qualifies for system-financed (0 PP) transport
   - Fee calculation based on weight, category, and route
   - Proper formatting for each field (codes, units, separators)
   
   Shipment data:
   - Sender ID: 450202122
   - Origin: Gdańsk
   - Destination: Żarnowiec
   - Weight: 2800 kg
   - Budget: 0 PP (must be free / system-financed)
   - Contents: kasety z paliwem do reaktora
   - Special remarks: NONE (do not add any)

3. FILL THE DECLARATION
   - Copy the exact template from the documentation.
   - Fill each field precisely. Preserve all formatting: separators, line breaks, field labels, order.
   - Do NOT add any extra fields, comments, or remarks not required by the template.

4. SUBMIT
   - Use the submit_declaration tool to send the completed declaration.
   - If the Hub returns an error, read the error message carefully, adjust the declaration, and resubmit.
   - Repeat until you receive a flag or exhaust 5 attempts.

## Rules
- NEVER guess a route code or fee — always derive them from the documentation.
- If a document is an image (fetch_url will tell you), call analyze_image with the URL to extract its content.
- The declaration format must match the template EXACTLY — character for character in structure.
- Do not add special remarks. Leave that field empty or use whatever the template specifies for "no remarks".
- When in doubt, re-read the relevant documentation file.
- Begin now by fetching the documentation index.
```

---

## 3. Tool Definitions (Function Calls)

### 3.1 `fetch_url`

**Description:** Fetches the content of a remote URL. Returns text for text-based files (md, html, txt, json). For images, it stores the binary data in an in-memory cache and returns a notice instructing the agent to call `analyze_image` with the same URL.

**Input Schema:**
```json
{
  "type": "object",
  "properties": {
    "url": {
      "type": "string",
      "description": "The full URL to fetch."
    }
  },
  "required": ["url"]
}
```

**Behavior:**
- Perform an HTTP GET request to the given URL.
- Determine content type from the response `Content-Type` header and file extension.
- If the content is text-based (markdown, html, plain text, json): return the body as a UTF-8 string.
- If the content is an image (png, jpg, gif, webp) or other binary: store the base64-encoded data in an in-memory cache keyed by resolved URL, and return a message telling the agent to call `analyze_image`.
- Resolve relative URLs against the documentation base URL.
- Return an error message if the request fails (4xx, 5xx, network error).

**Return value (text):**
```json
{
  "contentType": "text/markdown",
  "content": "<string body>",
  "isImage": false,
  "url": "<resolved url>"
}
```

**Return value (image):**
```json
{
  "isImage": true,
  "url": "<resolved url>",
  "message": "Image fetched and stored (image/png, 12345 bytes). Use analyze_image with url=\"<url>\" to extract text/data from it."
}
```

> **Design note:** Image binary data is never passed through the LLM's tool call arguments. Passing base64 through the model causes truncation and `invalid_base64` errors. Instead, images are cached server-side and referenced by URL.

---

### 3.2 `analyze_image`

**Description:** Analyzes a previously fetched image URL using a vision-capable model. Looks up the image from the in-memory cache (or fetches it directly if not cached). Returns extracted text / description.

**Input Schema:**
```json
{
  "type": "object",
  "properties": {
    "url": {
      "type": "string",
      "description": "The URL of the image (should have been fetched previously with fetch_url)."
    },
    "question": {
      "type": "string",
      "description": "A question or instruction for the vision model, e.g. 'Extract all text and tables from this image verbatim.'"
    }
  },
  "required": ["url", "question"]
}
```

**Behavior:**
- Resolve the URL against the documentation base URL.
- Look up cached image data from the in-memory map. If not found, fetch the image directly.
- Construct a chat completion request with a vision-capable model.
- Include the image as a base64 `image_url` content part.
- Include the `question` as a user text content part.
- Return the model's text response.

**Return value:**
```json
{
  "analysis": "<text extracted / description from the image>"
}
```

---

### 3.3 `submit_declaration`

**Description:** Submits the completed declaration text to the Hub verification endpoint.

**Input Schema:**
```json
{
  "type": "object",
  "properties": {
    "declaration": {
      "type": "string",
      "description": "The full text of the filled declaration, formatted exactly as the template requires."
    }
  },
  "required": ["declaration"]
}
```

**Behavior:**
- Send a POST request to `https://hub.ag3nts.org/verify` with JSON body:
  ```json
  {
    "apikey": "<AIDEVS_API_KEY from env>",
    "task": "sendit",
    "answer": {
      "declaration": "<declaration>"
    }
  }
  ```
- Return the full response body from the Hub.

**Return value:**
```json
{
  "response": "<raw response body from Hub>"
}
```

---

## 4. Execution Flow

```
START
  │
  ├─ 1. Agent receives the system prompt + shipment data + documentation entry URL
  │     Documentation entry URL: https://hub.ag3nts.org/dane/doc/index.md
  │
  ├─ 2. Agent calls fetch_url(index URL)
  │     → Reads the index, extracts ALL links to sub-pages / attachments
  │
  ├─ 3. For each referenced file:
  │     ├─ Agent calls fetch_url(file URL)
  │     ├─ If response reports image stored → calls analyze_image(same URL) to extract content
  │     ├─ Agent accumulates knowledge: template, routes, fees, categories, rules
  │     └─ If the fetched file references further files → fetch those too
  │
  ├─ 4. Agent synthesizes all gathered documentation:
  │     ├─ Identifies the declaration template (exact format)
  │     ├─ Looks up route code for Gdańsk → Żarnowiec
  │     ├─ Determines shipment category for "kasety z paliwem do reaktora"
  │     ├─ Calculates fee (must be 0 PP — finds category/rule that allows this)
  │     └─ Resolves any abbreviations or codes using documentation
  │
  ├─ 5. Agent fills the declaration template field by field
  │     → Produces the final declaration string
  │
  ├─ 6. Agent calls submit_declaration(declaration)
  │     ├─ If Hub returns FLG → SUCCESS, print flag
  │     └─ If Hub returns error → read hint, adjust declaration, go to step 5
  │        (max 5 retry attempts)
  │
  └─ END (print flag or final error)
```

### Key Decision Points

- **Image detection:** When `fetch_url` returns `isImage: true`, the image binary is cached server-side. The agent MUST then call `analyze_image` with the same URL to extract content. Image data never flows through tool call arguments.
- **Link discovery:** The agent must parse fetched markdown/HTML for relative and absolute links and resolve them against the base URL (`https://hub.ag3nts.org/dane/doc/`).
- **Fee = 0 PP:** The agent must find a shipment category or rule in the documentation that results in zero cost. This is critical — the agent should NOT fabricate a reason but find the actual rule.
- **Error recovery:** Hub error messages contain actionable hints. The agent should parse them and make targeted corrections rather than regenerating the entire declaration.

---

## 5. Dependencies & Environment

### package.json additions

The existing `package.json` already includes `axios`, `dotenv`, and `openai`. No additional libraries are strictly required. The current dependencies are sufficient:

| Package | Purpose |
|---|---|
| `openai` | Chat completions (tool-use agent loop) + vision (image analysis) |
| `axios` | HTTP requests for fetching documentation and submitting to Hub |
| `dotenv` | Loading environment variables |

### Environment Variables (`.env`)

```env
OPENAI_API_KEY=<your OpenAI API key>
OPENAI_MODEL=<model name, e.g. gpt-4o or gpt-5-mini>
OPENAI_BASE_URL=<optional, override for OpenAI-compatible endpoints>
AI_DEVS_API_KEY=<your AI Devs / Hub API key>
```

Note: `HUB_API_KEY` is accepted as a fallback for `AI_DEVS_API_KEY`.

### Project Structure

```
src/
  index.ts          # Entry point — orchestrates the agent loop
  agent.ts          # Agent loop: sends messages to LLM, handles tool calls
  tools.ts          # Tool implementations: fetch_url, analyze_image, submit_declaration
  prompts.ts        # System prompt and shipment data constants
```

### Coding Standards:
1. Language: Write all code (including variable names and functions) in English.
2. Modularity: Organize the code into logical modules; do not put everything in a single index.ts file.
3. Tech Stack: Use TypeScript.
4. Environment Setup: Use the dotenv package to manage environment variables.
5. Architecture: Apply SOLID principles throughout the codebase.
6. Clean Code: Write self-explanatory code and do not use inline comments.
7. Formatting: Do not use semicolons at the end of lines.

---

## 6. Key Implementation Notes

1. **Image data must not pass through LLM tool arguments.** The LLM truncates large base64 strings in tool call arguments, causing `invalid_base64` errors. The fix: `fetch_url` caches images in-memory and `analyze_image` accepts only a URL, looking up cached data server-side.

2. **Clean assistant messages for the conversation history.** The raw OpenAI SDK response object contains extra properties that can break serialization on subsequent API calls. Assistant messages must be reconstructed with only `role`, `content`, and `tool_calls` (with clean `id`, `type`, `function` objects).

3. **Sanitize tool result strings.** Tool outputs may contain control characters (from fetched content) that break JSON serialization. A sanitizer strips invalid control characters (`\x00-\x08`, `\x0B`, `\x0C`, `\x0E-\x1F`) from all tool results before adding them to the message history.

4. **No hardcoded temperature.** Some models (e.g. `gpt-5-mini`) do not support `temperature: 0`. The agent loop omits the temperature parameter entirely, relying on the model default.

5. **OpenAI client configuration.** The `OpenAI` client in `agent.ts` accepts optional `baseURL` and `apiKey` from environment, allowing use with OpenAI-compatible providers (Groq, OpenRouter, local models).

---

## 7. Acceptance Criteria

- [ ] **Documentation crawl:** The agent fetches `index.md` and recursively discovers and reads ALL linked documentation files (markdown, text, images).
- [ ] **Image processing:** Image files in the documentation are sent to a vision model and their content is correctly extracted.
- [ ] **Route resolution:** The agent correctly identifies the route code for Gdańsk → Żarnowiec from the documentation data.
- [ ] **Fee calculation:** The agent determines the correct fee (0 PP) based on the shipment category and documentation rules — not by hardcoding.
- [ ] **Template compliance:** The declaration output matches the official template format exactly (field names, order, separators, line structure).
- [ ] **No special remarks:** The special remarks field is empty or uses the standard "no remarks" indicator per the template.
- [ ] **Successful submission:** The agent submits the declaration to `https://hub.ag3nts.org/verify` and receives a `{FLG:...}` response.
- [ ] **Error handling:** If the Hub rejects the declaration, the agent reads the error, adjusts, and retries (up to 5 times).
- [ ] **Runs end-to-end:** `npm run start` executes the full pipeline from documentation fetch to flag retrieval without manual intervention.
- [ ] **No hardcoded documentation content:** The agent does not contain hardcoded file names, route codes, fee values, or template text from the documentation directory. All such data is discovered at runtime by crawling from the index URL.