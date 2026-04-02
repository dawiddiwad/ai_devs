import type { FunctionTool } from 'openai/resources/responses/responses'
import type { ReasoningEffort } from 'openai/resources/shared'

export interface AgentTool {
	definition: FunctionTool
	execute: (args: unknown) => Promise<string>
}

export interface AgentConfig {
	api: 'responses' | 'completions'
	tools: AgentTool[]
	systemPrompt: string
	userPrompt: string
	maxIterations?: number
	model?: string
	temperature?: number
	reasoning?: { effort: ReasoningEffort }
	toolChoice?: 'auto' | 'required' | 'none'
	compactThreshold?: number
	exitOnFlag?: boolean
	onToolCall?: (name: string, args: unknown, result: string) => void | Promise<void>
	onMessage?: (content: string) => void | Promise<void>
}

export interface AgentResult {
	finalMessage: string
	iterations: number
	flagCaptured: string | null
}

export interface CoreConfig {
	openaiBaseUrl?: string
	openaiApiKey: string
	openaiModel: string
	openaiTemperature?: number
	aiDevsApiKey: string
	verifyEndpoint: string
	taskName: string
	[key: string]: unknown
}

export interface VerifyResult {
	responseText: string
	flag: string | null
	data: unknown
}
