export interface ApiRequestBody {
  apikey: string
  task: string
  answer: {
    action: string
    [key: string]: unknown
  }
}

export interface ApiResponse {
  status: number
  data: Record<string, unknown>
  rateLimitReset: number | null
}

export interface ToolCallInput {
  action: string
  params?: Record<string, unknown>
}

export interface AgentMessage {
  role: "system" | "user" | "assistant" | "tool"
  content: string
  tool_calls?: Array<{
    id: string
    type: "function"
    function: {
      name: string
      arguments: string
    }
  }>
  tool_call_id?: string
}
