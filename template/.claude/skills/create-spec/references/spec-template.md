# AI Agent for [Task Name]

## 1. Overview & Goal

### Task Summary

<!-- Main objective. What problem does the agent solve? -->

### Hardcoded Inputs / Initial Data

<!-- Starting data, credentials, parameters -->

| Field | Value |
| ----- | ----- |

### Final Deliverable

<!-- What constitutes success -->

---

## 2. Agent Persona & Prompt Strategy

### System Prompt

```markdown
You are a [Persona]. Your job is to [Task].

## Workflow

1. ...
2. ...

## Rules

- ...
```

---

## 3. Tool Definitions

### 3.1 `tool_name`

**Description:** ...

**Input Schema:**

```json
{
	"type": "object",
	"properties": {},
	"required": []
}
```

**Behavior:** ...

**Returns:** ...

---

## 4. Execution Flow

```
START
  ├─ 1. [Step]
  ├─ 2. [Step]
  └─ END
```

### Key Decision Points

<!-- Edge cases, retry logic, failure handling -->

---

## 5. Dependencies & Environment

### package.json additions

| Package | Purpose |
| ------- | ------- |

### Environment Variables

```env
# Beyond standard .env.example
```

### Project Structure

```
src/
  index.ts
  agent.ts
  config.ts
  logger.ts
  tools/
```

---

## 6. Key Implementation Notes

1. ...

---

## 7. Acceptance Criteria

- [ ] Requirements met
- [ ] Builds cleanly (`npm run build`)
- [ ] Error handling for API failures
- [ ] Flag captured programmatically if applicable
