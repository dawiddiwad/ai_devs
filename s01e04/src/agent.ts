import OpenAI from "openai"
import { SYSTEM_PROMPT } from "./prompts"
import { toolDefinitions, executeTool } from "./tools"

const MAX_ITERATIONS = 30
export const model = process.env.OPENAI_MODEL || "gpt-5-mini"

function sanitizeString(str: string): string {
  return str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
}

export async function runAgent(): Promise<string> {
  const openai = new OpenAI({
    baseURL: process.env.OPENAI_BASE_URL ?? undefined,
    apiKey: process.env.OPENAI_API_KEY ?? undefined,
  })

  console.log(`[agent] Starting agent with model: ${model}`)

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content:
        "Please begin by fetching the documentation index and then complete the transport declaration task.",
    },
  ]

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    console.log(`\n=== Agent iteration ${iteration + 1} ===`)

    const response = await openai.chat.completions.create({
      model,
      messages,
      max_completion_tokens: 10000,
      tools: toolDefinitions,
    })

    const choice = response.choices[0]
    const msg = choice.message

    if (msg.tool_calls && msg.tool_calls.length > 0) {
      const cleanToolCalls = msg.tool_calls
        .filter((tc): tc is OpenAI.Chat.Completions.ChatCompletionMessageFunctionToolCall => tc.type === "function")
        .map((tc) => ({
          id: tc.id,
          type: "function" as const,
          function: { name: tc.function.name, arguments: tc.function.arguments },
        }))

      messages.push({
        role: "assistant" as const,
        content: msg.content || null,
        tool_calls: cleanToolCalls,
      })

      for (const toolCall of cleanToolCalls) {
        const fnName = toolCall.function.name
        let fnArgs: Record<string, any>
        try {
          fnArgs = JSON.parse(toolCall.function.arguments)
        } catch {
          fnArgs = {}
        }

        console.log(`[agent] Tool call: ${fnName}(${JSON.stringify(fnArgs).slice(0, 200)})`)

        const result = await executeTool(fnName, fnArgs)
        const sanitized = sanitizeString(result)

        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: sanitized,
        })
      }
      continue
    }

    messages.push({ role: "assistant", content: msg.content || "" })
    const finalText = msg.content || ""
    console.log(`\n[agent] Final response:\n${finalText}`)

    const flagMatch = finalText.match(/\{FLG:.*?\}/)
    if (flagMatch) {
      console.log(`\n✅ FLAG FOUND: ${flagMatch[0]}`)
      return flagMatch[0]
    }

    if (choice.finish_reason === "stop") {
      console.log("[agent] Model stopped without flag. Nudging to continue...")
      messages.push({
        role: "user",
        content:
          "Continue with your task. If you have gathered enough documentation, fill the declaration and submit it. If the Hub returned an error, fix the declaration and resubmit.",
      })
    }
  }

  console.log("[agent] Max iterations reached without obtaining a flag.")
  return "FAILED"
}
