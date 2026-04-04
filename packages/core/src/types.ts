import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'
import type { FunctionTool, ResponseInput } from 'openai/resources/responses/responses'
import type { ReasoningEffort } from 'openai/resources/shared'

export interface AgentTool {
	definition: FunctionTool
	execute: (args: unknown) => Promise<string>
}

export type AgentApi = 'responses' | 'completions'

export interface AgentResponsesMessageContext {
	api: 'responses'
	iterationIndex: number
	content: string
	input: ResponseInput
}

export interface AgentCompletionsMessageContext {
	api: 'completions'
	iterationIndex: number
	content: string
	messages: ChatCompletionMessageParam[]
}

export type AgentMessageContext = AgentResponsesMessageContext | AgentCompletionsMessageContext

export type AgentResponsesMessageHandlerResult =
	| { action: 'continue'; content?: string; input?: ResponseInput }
	| { action: 'final'; content?: string; input?: ResponseInput }

export type AgentCompletionsMessageHandlerResult =
	| { action: 'continue'; content?: string; messages?: ChatCompletionMessageParam[] }
	| { action: 'final'; content?: string; messages?: ChatCompletionMessageParam[] }

export type AgentMessageHandlerResult = void | AgentResponsesMessageHandlerResult | AgentCompletionsMessageHandlerResult

export interface AgentResponsesToolCallContext {
	api: 'responses'
	iterationIndex: number
	name: string
	args: unknown
	input: ResponseInput
	executeDefault: () => Promise<string>
}

export interface AgentCompletionsToolCallContext {
	api: 'completions'
	iterationIndex: number
	name: string
	args: unknown
	messages: ChatCompletionMessageParam[]
	executeDefault: () => Promise<string>
}

export type AgentToolCallContext = AgentResponsesToolCallContext | AgentCompletionsToolCallContext

export type AgentResponsesToolCallHandlerResult =
	| { action: 'continue'; result?: string; input?: ResponseInput }
	| { action: 'final'; result: string; input?: ResponseInput }

export type AgentCompletionsToolCallHandlerResult =
	| { action: 'continue'; result?: string; messages?: ChatCompletionMessageParam[] }
	| { action: 'final'; result: string; messages?: ChatCompletionMessageParam[] }

export type AgentToolCallHandlerResult =
	| void
	| AgentResponsesToolCallHandlerResult
	| AgentCompletionsToolCallHandlerResult

export interface AgentResponsesNoToolCallsContext {
	api: 'responses'
	iterationIndex: number
	content: string
	input: ResponseInput
}

export interface AgentCompletionsNoToolCallsContext {
	api: 'completions'
	iterationIndex: number
	content: string
	messages: ChatCompletionMessageParam[]
}

export type AgentNoToolCallsContext = AgentResponsesNoToolCallsContext | AgentCompletionsNoToolCallsContext

export type AgentResponsesNoToolCallsHandlerResult =
	| { action: 'continue'; content?: string; input: ResponseInput }
	| { action: 'final'; content?: string; input?: ResponseInput }

export type AgentCompletionsNoToolCallsHandlerResult =
	| { action: 'continue'; content?: string; messages: ChatCompletionMessageParam[] }
	| { action: 'final'; content?: string; messages?: ChatCompletionMessageParam[] }

export type AgentNoToolCallsHandlerResult =
	| void
	| AgentResponsesNoToolCallsHandlerResult
	| AgentCompletionsNoToolCallsHandlerResult

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
	handleNoToolCalls?: (
		context: AgentNoToolCallsContext
	) => AgentNoToolCallsHandlerResult | Promise<AgentNoToolCallsHandlerResult>
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
