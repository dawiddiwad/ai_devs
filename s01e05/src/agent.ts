import OpenAI from "openai"
import { ChatCompletionMessageFunctionToolCall } from "openai/resources/chat/completions/completions"
import { RailwayApiClient } from "./api-client"
import { SYSTEM_PROMPT, INITIAL_USER_PROMPT } from "./prompts"
import { TOOL_DEFINITIONS } from "./tools"
import { ToolCallInput } from "./types"

const FLAG_PATTERN = /\{FLG:[^}]+\}/

export class Agent {
  private openai: OpenAI
  private apiClient: RailwayApiClient
  private messages: OpenAI.ChatCompletionMessageParam[]

  constructor(openai: OpenAI, apiClient: RailwayApiClient) {
    this.openai = openai
    this.apiClient = apiClient
    this.messages = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: INITIAL_USER_PROMPT },
    ]
  }

  async run(): Promise<string> {
    const maxIterations = 30

    for (let i = 0; i < maxIterations; i++) {
      console.log(`\n=== Agent iteration ${i + 1} ===`)

      const completion = await this.openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || "gpt-5-mini",
        max_completion_tokens: 10000,
        messages: this.messages,
        tools: TOOL_DEFINITIONS,
      })

      const choice = completion.choices[0]
      const message = choice.message

      this.messages.push(message)

      if (message.content) {
        console.log(`[AGENT] ${message.content}`)
        const flagMatch = message.content.match(FLAG_PATTERN)
        if (flagMatch) {
          return flagMatch[0]
        }
      }

      if (choice.finish_reason === "stop" && !message.tool_calls?.length) {
        console.log("[AGENT] Model stopped without tool calls or flag. Retrying...")
        continue
      }

      if (!message.tool_calls?.length) {
        continue
      }

      for (const toolCall of message.tool_calls as ChatCompletionMessageFunctionToolCall[]) {
        const result = await this.handleToolCall(toolCall)

        this.messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: result,
        })

        const flagMatch = result.match(FLAG_PATTERN)
        if (flagMatch) {
          console.log(`\n*** FLAG FOUND: ${flagMatch[0]} ***`)
          return flagMatch[0]
        }
      }
    }

    throw new Error("Agent exceeded maximum iterations without finding the flag")
  }

  private async handleToolCall(
    toolCall: ChatCompletionMessageFunctionToolCall
  ): Promise<string> {
    if (toolCall.function.name !== "callRailwayApi") {
      return JSON.stringify({ error: `Unknown tool: ${toolCall.function.name}` })
    }

    const args = JSON.parse(toolCall.function.arguments) as ToolCallInput

    console.log(`[TOOL CALL] callRailwayApi(action="${args.action}", params=${JSON.stringify(args.params ?? {})})`)

    try {
      const response = await this.apiClient.callApi(args)
      return JSON.stringify(response)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return JSON.stringify({ error: errorMessage })
    }
  }
}
