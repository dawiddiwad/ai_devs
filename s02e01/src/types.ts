export type ClassificationLabel = 'DNG' | 'NEU'

export interface CargoItem {
  id: string
  description: string
}

export interface HubResetResponse {
  code?: number
  message?: string
  [key: string]: unknown
}

export interface HubVerifyPayload {
  apikey: string
  task: string
  answer: {
    prompt: string
  }
}

export interface HubClientConfig {
  apiKey: string
  taskName: string
  verifyUrl: string
  dataUrl: string
}

export interface AgentConfig {
  model: string
  temperature?: number
  maxTurns: number
}

export interface ToolResultEnvelope {
  tool: string
  ok: boolean
  data?: unknown
  error?: string
}
