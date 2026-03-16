<!-- Task Name for AI Agent -->
# AI Agent for [Task Name]

## 1. Overview & Goal

### Task Summary
<!-- Describe the main objective of the agent. What is the overall problem it solves? -->
<!-- e.g., "The agent must autonomously fetch, process, and analyze data to submit a final report." -->

### Hardcoded Inputs / Initial Data
<!-- List any specific starting data, credentials, or parameters the agent needs. -->
<!-- 
| Field | Value |
|---|---|
| Example Field | Example Value |
-->

### Final Deliverable
<!-- Define what constitutes a successful completion of the task. -->
<!-- e.g., "A POST request to endpoint X with JSON payload Y, returning a success flag." -->

---

## 2. Agent Persona & Prompt Strategy

### System Prompt (for the inner LLM agent)

```markdown
<!-- Provide the template for the system prompt used to instruct the agent. -->
You are a [Persona Description]. Your job is to [Main Task].

## Your workflow of agent loop
1. STEP ONE: [Action]
2. STEP TWO: [Action]
3. ...

## Rules
- RULE ONE: [Constraint]
- RULE TWO: [Constraint]
```

---

## 3. Tool Definitions (Function Calls)

<!-- Document each tool the agent can use. Duplicate the block below for each tool. -->

### 3.1 `[tool_name]`

**Description:** <!-- What does the tool do? -->

**Input Schema:**
```json
// Provide the JSON schema for the tool arguments
{
  "type": "object",
  "properties": {
    "param1": {
      "type": "string",
      "description": "..."
    }
  },
  "required": ["param1"]
}
```

**Behavior:**
<!-- List the specific actions, API calls, or logic the tool performs. -->

**Return value:**
```json
// Provide the expected JSON return structure
{
  "result": "..."
}
```

---

## 4. Execution Flow

```text
<!-- Provide an ASCII flowchart or step-by-step logic of the expected agent execution -->
START
  │
  ├─ 1. [Initial Step]
  │
  ├─ 2. [Next Step / Sub-loop]
  │
  └─ END ([Final Action])
```

### Key Decision Points
<!-- Highlight complex logic, edge cases, or critical failure/retry loops. -->

---

## 5. Dependencies & Environment

### package.json additions
<!-- List any required external libraries and their purpose. -->
| Package | Purpose |
|---|---|
| `example-pkg` | Does something |

### Environment Variables (`.env`)
```env
# List required environment variables
API_KEY=<your api key>
```

### Project Structure
```text
# Suggest a basic directory layout
src/
  index.ts          # Entry point
  agent.ts          # Agent logic
  tools.ts          # Tool implementations
  prompts.ts        # Prompts
```

---

## 6. Key Implementation Notes
<!-- Document technical gotchas, known LLM quirks, payload sanitization requirements, formatting rules, etc. -->
1. [Note 1]
2. [Note 2]

---

## 7. Acceptance Criteria
<!-- A checklist of conditions that must be met for the feature to be considered complete. -->
- [ ] Requirements met
- [ ] Tests pass
- [ ] Error handling built in

## 8. Coding Standards (do not change):
1. Language: Write all code (including variable names and functions) in English.
2. Modularity: Organize the code into logical modules; do not put everything in a single index.ts file.
3. Tech Stack: Use TypeScript.
4. Environment Setup: Use the dotenv package to manage environment variables.
5. Architecture: Apply SOLID principles throughout the codebase.
6. Clean Code: Write self-explanatory code and do not use inline comments.
7. Formatting: Do not use semicolons at the end of lines.
8. Use package.json as a baseline, feel free to extend if needed.