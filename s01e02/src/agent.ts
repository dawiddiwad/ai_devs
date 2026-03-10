import OpenAI from "openai"
import { tools } from "./tools"
import { executeTool } from "./tool-executor"

const MAX_ITERATIONS = 15

const SYSTEM_PROMPT = `You are an investigative AI agent. 
Your task is to find which suspect was seen near a nuclear power plant, determine their access level, and submit the result.
IMPORTANT: Each suspect can have MULTIPLE locations. Be efficient — use batch capabilities of tools to minimize the number of calls.`

export async function runAgent(): Promise<void> {
  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL
  })

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: "Find the suspect near a nuclear power plant, get their access level, and submit the verification." },
  ]

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    console.log(`\n--- Agent iteration ${i + 1} ---`)

    const response = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL ?? "gpt-5-mini",
      messages,
      tools,
    })

    const choice = response.choices[0]
    const message = choice.message
    messages.push(message)

    if (choice.finish_reason === "stop") {
      console.log("\nAgent finished:", message.content)
      return
    }

    if (!message.tool_calls || message.tool_calls.length === 0) {
      console.log("\nAgent response:", message.content)
      return
    }

    const toolResults = await Promise.all(
      message.tool_calls.map(async (toolCall) => {
        if (toolCall.type !== "function") {
          return { role: "tool" as const, tool_call_id: toolCall.id, content: JSON.stringify({ error: "unsupported tool type" }) }
        }
        const args = JSON.parse(toolCall.function.arguments)
        console.log(`  Tool: ${toolCall.function.name}`, JSON.stringify(args))
        const result = await executeTool(toolCall.function.name, args)
        console.log(`  Result: ${result.substring(0, 200)}${result.length > 200 ? "..." : ""}`)
        return {
          role: "tool" as const,
          tool_call_id: toolCall.id,
          content: result,
        }
      })
    )

    messages.push(...toolResults)
  }

  console.error("Agent reached maximum iterations without completing.")
}
