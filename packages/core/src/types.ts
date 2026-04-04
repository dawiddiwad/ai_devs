import type { FunctionTool } from 'openai/resources/responses/responses'
import type { ReasoningEffort } from 'openai/resources/shared'

export interface AgentTool {
	definition: FunctionTool
	execute: (args: unknown) => Promise<string>
}

export type AgentApi = 'responses' | 'completions'

export interface AgentMessageContext {
	api: AgentApi
	iterationIndex: number
	content: string
}

export type AgentMessageHandlerResult =
	| void
	| { action: 'continue'; content?: string }
	| { action: 'final'; content?: string }

export interface AgentToolCallContext {
	api: AgentApi
	iterationIndex: number
	name: string
	args: unknown
	executeDefault: () => Promise<string>
}

export type AgentToolCallHandlerResult =
	| void
	| { action: 'continue'; result?: string }
	| { action: 'final'; result: string }

export interface AgentConfig {
	api: AgentApi
	tools: AgentTool[]
	systemPrompt: string
	userPrompt: string
	maxIterations?: number
	model?: string
	temperature?: number
	reasoning?: { effort: ReasoningEffort }
	serviceTier?: 'auto' | 'default' | 'flex' | 'scale' | 'priority' | null
	toolChoice?: 'auto' | 'required' | 'none'
	compactThreshold?: number
	exitOnFlag?: boolean
	onToolCall?: (name: string, args: unknown, result: string) => void | Promise<void>
	onMessage?: (content: string) => void | Promise<void>
	handleToolCall?: (context: AgentToolCallContext) => AgentToolCallHandlerResult | Promise<AgentToolCallHandlerResult>
	handleMessage?: (context: AgentMessageContext) => AgentMessageHandlerResult | Promise<AgentMessageHandlerResult>
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

export type CreateConfigRequiredEnv = Record<string, string>

export type CreateConfigOptionalEnvValue = string | { name: string; fallback?: string }

export type CreateConfigOptionalEnv = Record<string, CreateConfigOptionalEnvValue>

type EmptyConfigFields = Record<string, never>

export type CreateConfigResolvedEnv<
	RequiredEnv extends CreateConfigRequiredEnv = EmptyConfigFields,
	OptionalEnv extends CreateConfigOptionalEnv = EmptyConfigFields,
> = {
	[K in keyof RequiredEnv]: string
} & {
	[K in keyof OptionalEnv]: string | undefined
}

export interface CreateConfigOptions<
	Overrides extends Record<string, unknown> = EmptyConfigFields,
	RequiredEnv extends CreateConfigRequiredEnv = EmptyConfigFields,
	OptionalEnv extends CreateConfigOptionalEnv = EmptyConfigFields,
> {
	overrides?: Partial<CoreConfig> & Overrides
	requiredEnv?: RequiredEnv
	optionalEnv?: OptionalEnv
}

export type CreateConfigResult<
	Overrides extends Record<string, unknown> = EmptyConfigFields,
	RequiredEnv extends CreateConfigRequiredEnv = EmptyConfigFields,
	OptionalEnv extends CreateConfigOptionalEnv = EmptyConfigFields,
> = CoreConfig & Overrides & CreateConfigResolvedEnv<RequiredEnv, OptionalEnv>
