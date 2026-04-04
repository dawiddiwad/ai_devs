import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'
import type { FunctionTool, ResponseInput } from 'openai/resources/responses/responses'
import type { ReasoningEffort } from 'openai/resources/shared'

/**
 * Executable tool contract consumed by the agent runner.
 *
 * `definition` is sent to OpenAI so the model can decide when to call the tool.
 * `execute` receives already-parsed arguments and must return a string payload that
 * is fed back into the loop as the tool result.
 *
 * @example
 * ```ts
 * const tool: AgentTool = {
 *   definition: {
 *     type: 'function',
 *     name: 'lookup_weather',
 *     description: 'Fetches weather for a city',
 *     parameters: {
 *       type: 'object',
 *       properties: { city: { type: 'string' } },
 *       required: ['city'],
 *     },
 *   },
 *   async execute(args) {
 *     return JSON.stringify({ ok: true, args })
 *   },
 * }
 * ```
 */
export interface AgentTool {
	definition: FunctionTool
	execute: (args: unknown) => Promise<string>
}

/**
 * Supported OpenAI APIs for the agent runner.
 *
 * - `responses`: conversation-backed Responses API loop using incremental `input`
 * - `completions`: chat completions loop using full `messages` history
 *
 * @example
 * ```ts
 * const api: AgentApi = 'responses'
 * ```
 */
export type AgentApi = 'responses' | 'completions'

/**
 * Context passed to `handleMessage` when the active loop uses the Responses API.
 *
 * Input:
 * - `content`: normalized assistant text extracted from the current response item
 * - `input`: pending incremental input that will be sent on the next `responses.create()`
 *
 * Output expectations:
 * - callers usually inspect `content`
 * - advanced handlers may trim, replace, or append to `input`
 *
 * @example
 * ```ts
 * const context: AgentResponsesMessageContext = {
 *   api: 'responses',
 *   iterationIndex: 0,
 *   content: 'I should inspect the warehouse data.',
 *   input: [],
 * }
 * ```
 */
export interface AgentResponsesMessageContext {
	api: 'responses'
	iterationIndex: number
	content: string
	input: ResponseInput
}

/**
 * Context passed to `handleMessage` when the active loop uses the Chat Completions API.
 *
 * Input:
 * - `content`: assistant text for the current iteration
 * - `messages`: full local chat transcript that will be sent on the next completion call
 *
 * Output expectations:
 * - handlers may keep the content as-is
 * - advanced handlers may rewrite or shrink `messages`
 *
 * @example
 * ```ts
 * const context: AgentCompletionsMessageContext = {
 *   api: 'completions',
 *   iterationIndex: 2,
 *   content: 'I need one more tool call.',
 *   messages: [
 *     { role: 'system', content: 'You are helpful.' },
 *     { role: 'user', content: 'Solve the task.' },
 *   ],
 * }
 * ```
 */
export interface AgentCompletionsMessageContext {
	api: 'completions'
	iterationIndex: number
	content: string
	messages: ChatCompletionMessageParam[]
}

/**
 * Union of all possible `handleMessage` contexts.
 *
 * Narrow on `api` before accessing the accumulator field:
 * - `input` for `responses`
 * - `messages` for `completions`
 *
 * @example
 * ```ts
 * function handleMessage(context: AgentMessageContext) {
 *   if (context.api === 'responses') {
 *     return { action: 'continue', input: [...context.input] }
 *   }
 *
 *   return { action: 'continue', messages: context.messages.slice(-8) }
 * }
 * ```
 */
export type AgentMessageContext = AgentResponsesMessageContext | AgentCompletionsMessageContext

/**
 * Result returned from `handleMessage` for the Responses API.
 *
 * Output:
 * - `action: 'continue'`: keep looping
 * - `action: 'final'`: stop the loop after applying the returned content/input
 * - `content`: optional replacement for the assistant message text
 * - `input`: optional replacement for the pending Responses API input accumulator
 *
 * @example
 * ```ts
 * const result: AgentResponsesMessageHandlerResult = {
 *   action: 'continue',
 *   content: 'Use a tool before answering.',
 *   input: [
 *     { role: 'user', content: 'Call a tool now.' },
 *   ],
 * }
 * ```
 */
export type AgentResponsesMessageHandlerResult =
	| { action: 'continue'; content?: string; input?: ResponseInput }
	| { action: 'final'; content?: string; input?: ResponseInput }

/**
 * Result returned from `handleMessage` for the Chat Completions API.
 *
 * Output:
 * - `action: 'continue'`: keep looping
 * - `action: 'final'`: stop the loop after applying the returned content/messages
 * - `content`: optional replacement for the assistant message text
 * - `messages`: optional replacement for the local chat history accumulator
 *
 * @example
 * ```ts
 * const result: AgentCompletionsMessageHandlerResult = {
 *   action: 'continue',
 *   messages: [
 *     { role: 'system', content: 'You are helpful.' },
 *     { role: 'user', content: 'Summarize only the latest facts.' },
 *   ],
 * }
 * ```
 */
export type AgentCompletionsMessageHandlerResult =
	| { action: 'continue'; content?: string; messages?: ChatCompletionMessageParam[] }
	| { action: 'final'; content?: string; messages?: ChatCompletionMessageParam[] }

/**
 * Union of all possible `handleMessage` results.
 *
 * Returning `void` means: keep the current content and accumulator unchanged.
 *
 * @example
 * ```ts
 * const result: AgentMessageHandlerResult = undefined
 * ```
 */
export type AgentMessageHandlerResult = void | AgentResponsesMessageHandlerResult | AgentCompletionsMessageHandlerResult

/**
 * Resolves the exact `handleMessage` context shape for the selected API.
 *
 * Input:
 * - `Api` is either `'responses'` or `'completions'`
 *
 * Output:
 * - the matching message context type for that API
 *
 * @example
 * ```ts
 * type ResponsesMessageContext = AgentMessageContextForApi<'responses'>
 * ```
 */
export type AgentMessageContextForApi<Api extends AgentApi> = Api extends 'responses'
	? AgentResponsesMessageContext
	: AgentCompletionsMessageContext

/**
 * Resolves the exact `handleMessage` result shape for the selected API.
 *
 * Input:
 * - `Api` is either `'responses'` or `'completions'`
 *
 * Output:
 * - `void` or the matching handler result for that API
 *
 * @example
 * ```ts
 * type CompletionsMessageResult = AgentMessageHandlerResultForApi<'completions'>
 * ```
 */
export type AgentMessageHandlerResultForApi<Api extends AgentApi> = Api extends 'responses'
	? void | AgentResponsesMessageHandlerResult
	: void | AgentCompletionsMessageHandlerResult

/**
 * Context passed to `handleToolCall` when the active loop uses the Responses API.
 *
 * Input:
 * - `name`: tool name requested by the model
 * - `args`: parsed tool arguments
 * - `input`: pending Responses API input accumulator
 * - `executeDefault`: callback that runs the normal tool implementation once
 *
 * Output expectations:
 * - handlers may call `executeDefault()` or bypass it entirely
 * - handlers may replace `input`
 *
 * @example
 * ```ts
 * const context: AgentResponsesToolCallContext = {
 *   api: 'responses',
 *   iterationIndex: 1,
 *   name: 'search_notes',
 *   args: { query: 'warehouse' },
 *   input: [],
 *   executeDefault: async () => JSON.stringify({ ok: true }),
 * }
 * ```
 */
export interface AgentResponsesToolCallContext {
	api: 'responses'
	iterationIndex: number
	name: string
	args: unknown
	input: ResponseInput
	executeDefault: () => Promise<string>
}

/**
 * Context passed to `handleToolCall` when the active loop uses the Chat Completions API.
 *
 * Input:
 * - `name`: tool name requested by the model
 * - `args`: parsed tool arguments
 * - `messages`: local chat transcript
 * - `executeDefault`: callback that runs the normal tool implementation once
 *
 * Output expectations:
 * - handlers may replace the tool result
 * - handlers may replace `messages`
 *
 * @example
 * ```ts
 * const context: AgentCompletionsToolCallContext = {
 *   api: 'completions',
 *   iterationIndex: 3,
 *   name: 'load_page',
 *   args: { url: 'https://example.com' },
 *   messages: [],
 *   executeDefault: async () => '<html />',
 * }
 * ```
 */
export interface AgentCompletionsToolCallContext {
	api: 'completions'
	iterationIndex: number
	name: string
	args: unknown
	messages: ChatCompletionMessageParam[]
	executeDefault: () => Promise<string>
}

/**
 * Union of all possible `handleToolCall` contexts.
 *
 * Narrow on `api` before accessing `input` or `messages`.
 *
 * @example
 * ```ts
 * function handleToolCall(context: AgentToolCallContext) {
 *   if (context.api === 'completions') {
 *     return { action: 'continue', messages: context.messages }
 *   }
 *
 *   return { action: 'continue', input: context.input }
 * }
 * ```
 */
export type AgentToolCallContext = AgentResponsesToolCallContext | AgentCompletionsToolCallContext

/**
 * Result returned from `handleToolCall` for the Responses API.
 *
 * Output:
 * - `result`: optional replacement tool result
 * - `input`: optional replacement Responses API accumulator
 * - `action: 'final'`: stop the loop after applying the result
 *
 * @example
 * ```ts
 * const result: AgentResponsesToolCallHandlerResult = {
 *   action: 'continue',
 *   result: JSON.stringify({ cached: true }),
 * }
 * ```
 */
export type AgentResponsesToolCallHandlerResult =
	| { action: 'continue'; result?: string; input?: ResponseInput }
	| { action: 'final'; result: string; input?: ResponseInput }

/**
 * Result returned from `handleToolCall` for the Chat Completions API.
 *
 * Output:
 * - `result`: optional replacement tool result
 * - `messages`: optional replacement chat history accumulator
 * - `action: 'final'`: stop the loop after applying the result
 *
 * @example
 * ```ts
 * const result: AgentCompletionsToolCallHandlerResult = {
 *   action: 'continue',
 *   messages: [
 *     { role: 'system', content: 'You are concise.' },
 *   ],
 * }
 * ```
 */
export type AgentCompletionsToolCallHandlerResult =
	| { action: 'continue'; result?: string; messages?: ChatCompletionMessageParam[] }
	| { action: 'final'; result: string; messages?: ChatCompletionMessageParam[] }

/**
 * Union of all possible `handleToolCall` results.
 *
 * Returning `void` means: use the default tool result and keep the accumulator unchanged.
 *
 * @example
 * ```ts
 * const result: AgentToolCallHandlerResult = undefined
 * ```
 */
export type AgentToolCallHandlerResult =
	| void
	| AgentResponsesToolCallHandlerResult
	| AgentCompletionsToolCallHandlerResult

/**
 * Resolves the exact `handleToolCall` context shape for the selected API.
 *
 * Input:
 * - `Api` is either `'responses'` or `'completions'`
 *
 * Output:
 * - the matching tool-call context type for that API
 *
 * @example
 * ```ts
 * type ResponsesToolContext = AgentToolCallContextForApi<'responses'>
 * ```
 */
export type AgentToolCallContextForApi<Api extends AgentApi> = Api extends 'responses'
	? AgentResponsesToolCallContext
	: AgentCompletionsToolCallContext

/**
 * Resolves the exact `handleToolCall` result shape for the selected API.
 *
 * Input:
 * - `Api` is either `'responses'` or `'completions'`
 *
 * Output:
 * - `void` or the matching tool-call result for that API
 *
 * @example
 * ```ts
 * type CompletionsToolResult = AgentToolCallHandlerResultForApi<'completions'>
 * ```
 */
export type AgentToolCallHandlerResultForApi<Api extends AgentApi> = Api extends 'responses'
	? void | AgentResponsesToolCallHandlerResult
	: void | AgentCompletionsToolCallHandlerResult

/**
 * Context passed to `handleNoToolCalls` when the active loop uses the Responses API.
 *
 * Input:
 * - `content`: last normalized assistant message
 * - `input`: pending Responses API input accumulator
 *
 * Output expectations:
 * - returning `action: 'continue'` must include a replacement `input`
 *
 * @example
 * ```ts
 * const context: AgentResponsesNoToolCallsContext = {
 *   api: 'responses',
 *   iterationIndex: 0,
 *   content: 'I am done.',
 *   input: [],
 * }
 * ```
 */
export interface AgentResponsesNoToolCallsContext {
	api: 'responses'
	iterationIndex: number
	content: string
	input: ResponseInput
}

/**
 * Context passed to `handleNoToolCalls` when the active loop uses the Chat Completions API.
 *
 * Input:
 * - `content`: last normalized assistant message
 * - `messages`: full local chat transcript
 *
 * Output expectations:
 * - returning `action: 'continue'` must include replacement `messages`
 *
 * @example
 * ```ts
 * const context: AgentCompletionsNoToolCallsContext = {
 *   api: 'completions',
 *   iterationIndex: 4,
 *   content: 'No more tools needed.',
 *   messages: [],
 * }
 * ```
 */
export interface AgentCompletionsNoToolCallsContext {
	api: 'completions'
	iterationIndex: number
	content: string
	messages: ChatCompletionMessageParam[]
}

/**
 * Union of all possible `handleNoToolCalls` contexts.
 *
 * Narrow on `api` before accessing the accumulator.
 *
 * @example
 * ```ts
 * function handleNoToolCalls(context: AgentNoToolCallsContext) {
 *   if (context.api === 'responses') {
 *     return { action: 'continue', input: [...context.input] }
 *   }
 *
 *   return { action: 'continue', messages: [...context.messages] }
 * }
 * ```
 */
export type AgentNoToolCallsContext = AgentResponsesNoToolCallsContext | AgentCompletionsNoToolCallsContext

/**
 * Result returned from `handleNoToolCalls` for the Responses API.
 *
 * Output:
 * - `action: 'continue'` must include `input`
 * - `action: 'final'` may optionally replace `content` and `input`
 *
 * @example
 * ```ts
 * const result: AgentResponsesNoToolCallsHandlerResult = {
 *   action: 'continue',
 *   content: 'Use a tool before stopping.',
 *   input: [{ role: 'user', content: 'Call a tool now.' }],
 * }
 * ```
 */
export type AgentResponsesNoToolCallsHandlerResult =
	| { action: 'continue'; content?: string; input: ResponseInput }
	| { action: 'final'; content?: string; input?: ResponseInput }

/**
 * Result returned from `handleNoToolCalls` for the Chat Completions API.
 *
 * Output:
 * - `action: 'continue'` must include `messages`
 * - `action: 'final'` may optionally replace `content` and `messages`
 *
 * @example
 * ```ts
 * const result: AgentCompletionsNoToolCallsHandlerResult = {
 *   action: 'continue',
 *   messages: [
 *     { role: 'user', content: 'Please call a tool before answering.' },
 *   ],
 * }
 * ```
 */
export type AgentCompletionsNoToolCallsHandlerResult =
	| { action: 'continue'; content?: string; messages: ChatCompletionMessageParam[] }
	| { action: 'final'; content?: string; messages?: ChatCompletionMessageParam[] }

/**
 * Union of all possible `handleNoToolCalls` results.
 *
 * Returning `void` means: keep the current loop behavior and finish normally.
 *
 * @example
 * ```ts
 * const result: AgentNoToolCallsHandlerResult = undefined
 * ```
 */
export type AgentNoToolCallsHandlerResult =
	| void
	| AgentResponsesNoToolCallsHandlerResult
	| AgentCompletionsNoToolCallsHandlerResult

/**
 * Resolves the exact `handleNoToolCalls` context shape for the selected API.
 *
 * Input:
 * - `Api` is either `'responses'` or `'completions'`
 *
 * Output:
 * - the matching no-tool-calls context type for that API
 *
 * @example
 * ```ts
 * type ResponsesNoToolCallsContext = AgentNoToolCallsContextForApi<'responses'>
 * ```
 */
export type AgentNoToolCallsContextForApi<Api extends AgentApi> = Api extends 'responses'
	? AgentResponsesNoToolCallsContext
	: AgentCompletionsNoToolCallsContext

/**
 * Resolves the exact `handleNoToolCalls` result shape for the selected API.
 *
 * Input:
 * - `Api` is either `'responses'` or `'completions'`
 *
 * Output:
 * - `void` or the matching no-tool-calls result for that API
 *
 * @example
 * ```ts
 * type CompletionsNoToolCallsResult = AgentNoToolCallsHandlerResultForApi<'completions'>
 * ```
 */
export type AgentNoToolCallsHandlerResultForApi<Api extends AgentApi> = Api extends 'responses'
	? void | AgentResponsesNoToolCallsHandlerResult
	: void | AgentCompletionsNoToolCallsHandlerResult

/**
 * Shared configuration fields used by both agent APIs.
 *
 * Input:
 * - prompt/model/tool settings required to execute the loop
 * - optional observer and interceptor hooks
 *
 * Output:
 * - a strongly typed config shape specialized by `Api`
 *
 * @example
 * ```ts
 * type BaseResponsesConfig = AgentConfigBase<'responses'>
 * ```
 */
interface AgentConfigBase<Api extends AgentApi> {
	/**
	 * Selects which OpenAI loop implementation should run.
	 *
	 * Input:
	 * - `'responses'`: use the conversation-backed Responses API loop
	 * - `'completions'`: use the chat completions loop with full local history
	 *
	 * Output:
	 * - narrows all handler contexts and results to the matching API
	 *
	 * @example
	 * ```ts
	 * api: 'responses'
	 * ```
	 */
	api: Api
	/**
	 * Tool registry exposed to the model for the current agent run.
	 *
	 * Input:
	 * - array of `AgentTool` definitions and executors
	 *
	 * Output:
	 * - each tool may be called by the model during the loop
	 *
	 * @example
	 * ```ts
	 * tools: [verifyTool, searchTool]
	 * ```
	 */
	tools: AgentTool[]
	/**
	 * System-level instruction prompt sent at the start of the run.
	 *
	 * Input:
	 * - stable rules, behavior constraints, and agent role description
	 *
	 * Output:
	 * - becomes the system message or system conversation item for the API
	 *
	 * @example
	 * ```ts
	 * systemPrompt: 'You are a precise warehouse analyst.'
	 * ```
	 */
	systemPrompt: string
	/**
	 * Initial user prompt that starts the task.
	 *
	 * Input:
	 * - the task request or first user instruction
	 *
	 * Output:
	 * - becomes the first user message/item in the loop
	 *
	 * @example
	 * ```ts
	 * userPrompt: 'Find the correct warehouse answer.'
	 * ```
	 */
	userPrompt: string
	/**
	 * Maximum number of loop iterations before the runner stops.
	 *
	 * Input:
	 * - positive integer limit
	 *
	 * Output:
	 * - caps how many request/response cycles the agent may execute
	 *
	 * @example
	 * ```ts
	 * maxIterations: 20
	 * ```
	 */
	maxIterations?: number
	/**
	 * Optional model override for this run.
	 *
	 * Input:
	 * - any model identifier accepted by the selected OpenAI API
	 *
	 * Output:
	 * - overrides `coreConfig.openaiModel` for this run only
	 *
	 * @example
	 * ```ts
	 * model: 'gpt-5-mini'
	 * ```
	 */
	model?: string
	/**
	 * Optional temperature override for this run.
	 *
	 * Input:
	 * - model sampling temperature, typically between `0` and `2`
	 *
	 * Output:
	 * - overrides `coreConfig.openaiTemperature` for this run only
	 *
	 * @example
	 * ```ts
	 * temperature: 0.2
	 * ```
	 */
	temperature?: number
	/**
	 * Optional reasoning settings for reasoning-capable models.
	 *
	 * Input:
	 * - currently supports an `effort` level understood by the OpenAI SDK
	 *
	 * Output:
	 * - forwarded to the Responses API request when present
	 *
	 * @example
	 * ```ts
	 * reasoning: { effort: 'low' }
	 * ```
	 */
	reasoning?: { effort: ReasoningEffort }
	/**
	 * Optional OpenAI service tier override.
	 *
	 * Input:
	 * - one of the supported service tiers, or `null` to send an explicit null
	 *
	 * Output:
	 * - forwarded to the underlying request to influence routing/priority behavior
	 *
	 * @example
	 * ```ts
	 * serviceTier: 'flex'
	 * ```
	 */
	serviceTier?: 'auto' | 'default' | 'flex' | 'scale' | 'priority' | null
	/**
	 * Tool choice policy for the run.
	 *
	 * Input:
	 * - `'auto'`: model decides whether to call tools
	 * - `'required'`: model must call a tool before answering
	 * - `'none'`: disable tool calling even if tools are registered
	 *
	 * Output:
	 * - forwarded to the OpenAI request when the API supports it
	 *
	 * @example
	 * ```ts
	 * toolChoice: 'required'
	 * ```
	 */
	toolChoice?: 'auto' | 'required' | 'none'
	/**
	 * Context compaction threshold for the Responses API conversation.
	 *
	 * Input:
	 * - approximate token threshold at which compaction may occur
	 *
	 * Output:
	 * - used only by the Responses API loop
	 *
	 * @example
	 * ```ts
	 * compactThreshold: 100000
	 * ```
	 */
	compactThreshold?: number
	/**
	 * Controls whether the process exits immediately after a flag is captured.
	 *
	 * Input:
	 * - `true` or omitted: call `process.exit(0)` when a flag is found
	 * - `false`: return normally instead of exiting
	 *
	 * Output:
	 * - affects flag handling in both loops and in verification helpers
	 *
	 * @example
	 * ```ts
	 * exitOnFlag: false
	 * ```
	 */
	exitOnFlag?: boolean
	/**
	 * Observer hook called after a tool result has been finalized.
	 *
	 * Input:
	 * - `name`: tool name
	 * - `args`: parsed tool arguments
	 * - `result`: final tool result after interceptor handling
	 *
	 * Output:
	 * - ignored by the runner; use it for logging or side effects only
	 *
	 * @example
	 * ```ts
	 * onToolCall(name, args, result) {
	 *   logger.tool('info', 'Observed tool call', { name, args, result })
	 * }
	 * ```
	 */
	onToolCall?: (name: string, args: unknown, result: string) => void | Promise<void>
	/**
	 * Observer hook called after an assistant message has been finalized.
	 *
	 * Input:
	 * - `content`: final normalized assistant text after interceptor handling
	 *
	 * Output:
	 * - ignored by the runner; use it for logging or side effects only
	 *
	 * @example
	 * ```ts
	 * onMessage(content) {
	 *   logger.agent('info', 'Observed assistant message', { content })
	 * }
	 * ```
	 */
	onMessage?: (content: string) => void | Promise<void>
	/**
	 * Interceptor hook for tool calls.
	 *
	 * Input:
	 * - API-specific context including the current accumulator and `executeDefault()`
	 *
	 * Output:
	 * - may keep default behavior, override the result, replace the accumulator, or finish early
	 *
	 * @example
	 * ```ts
	 * handleToolCall: async (context) => {
	 *   if (context.api === 'responses') {
	 *     return { action: 'continue', result: await context.executeDefault(), input: context.input }
	 *   }
	 *
	 *   return { action: 'continue', result: await context.executeDefault(), messages: context.messages }
	 * }
	 * ```
	 */
	handleToolCall?: (
		context: AgentToolCallContextForApi<Api>
	) => AgentToolCallHandlerResultForApi<Api> | Promise<AgentToolCallHandlerResultForApi<Api>>
	/**
	 * Interceptor hook for assistant messages.
	 *
	 * Input:
	 * - API-specific context including the current message text and accumulator
	 *
	 * Output:
	 * - may rewrite content, replace the accumulator, or finish early
	 *
	 * @example
	 * ```ts
	 * handleMessage: (context) => {
	 *   if (context.api === 'responses') {
	 *     return { action: 'continue', input: [...context.input] }
	 *   }
	 *
	 *   return { action: 'continue', messages: context.messages.slice(-8) }
	 * }
	 * ```
	 */
	handleMessage?: (
		context: AgentMessageContextForApi<Api>
	) => AgentMessageHandlerResultForApi<Api> | Promise<AgentMessageHandlerResultForApi<Api>>
	/**
	 * Interceptor hook for the branch where the model returned no tool calls.
	 *
	 * Input:
	 * - API-specific context containing the final message and current accumulator
	 *
	 * Output:
	 * - may allow the loop to finish
	 * - may force continuation by returning a replacement accumulator
	 * - `action: 'continue'` must include `input` for responses or `messages` for completions
	 *
	 * @example
	 * ```ts
	 * handleNoToolCalls: (context) => {
	 *   if (context.api === 'responses') {
	 *     return { action: 'continue', input: [...context.input, { role: 'user', content: 'Use a tool.' }] }
	 *   }
	 *
	 *   return { action: 'continue', messages: [...context.messages] }
	 * }
	 * ```
	 */
	handleNoToolCalls?: (
		context: AgentNoToolCallsContextForApi<Api>
	) => AgentNoToolCallsHandlerResultForApi<Api> | Promise<AgentNoToolCallsHandlerResultForApi<Api>>
}

/**
 * Fully specialized config for the Responses API loop.
 *
 * Input:
 * - `api` must be `'responses'`
 * - interceptor hooks receive `input`-based contexts
 *
 * Output:
 * - config object accepted by `runAgent(..., { api: 'responses', ... })`
 *
 * @example
 * ```ts
 * const config: AgentResponsesConfig = {
 *   api: 'responses',
 *   tools: [],
 *   systemPrompt: 'You are helpful.',
 *   userPrompt: 'Solve the task.',
 * }
 * ```
 */
export type AgentResponsesConfig = AgentConfigBase<'responses'> & { api: 'responses' }

/**
 * Fully specialized config for the Chat Completions API loop.
 *
 * Input:
 * - `api` must be `'completions'`
 * - interceptor hooks receive `messages`-based contexts
 *
 * Output:
 * - config object accepted by `runAgent(..., { api: 'completions', ... })`
 *
 * @example
 * ```ts
 * const config: AgentCompletionsConfig = {
 *   api: 'completions',
 *   tools: [],
 *   systemPrompt: 'You are helpful.',
 *   userPrompt: 'Solve the task.',
 * }
 * ```
 */
export type AgentCompletionsConfig = AgentConfigBase<'completions'> & { api: 'completions' }

/**
 * API-specialized config type used by `runAgent()`.
 *
 * Input:
 * - `Api` narrows the config to either responses or completions
 *
 * Output:
 * - a config type whose hook contexts/results match the selected API
 *
 * @example
 * ```ts
 * const config: AgentConfig<'completions'> = {
 *   api: 'completions',
 *   tools: [],
 *   systemPrompt: 'You are helpful.',
 *   userPrompt: 'Solve the task.',
 * }
 * ```
 */
export type AgentConfig<Api extends AgentApi = AgentApi> = Api extends 'responses'
	? AgentResponsesConfig
	: AgentCompletionsConfig

/**
 * Final result returned from an agent run.
 *
 * Output:
 * - `finalMessage`: last normalized assistant/tool output used as the final answer
 * - `iterations`: number of loop iterations that actually ran
 * - `flagCaptured`: extracted flag if one was found
 *
 * @example
 * ```ts
 * const result: AgentResult = {
 *   finalMessage: 'Task solved.',
 *   iterations: 3,
 *   flagCaptured: '{FLG:abc123}',
 * }
 * ```
 */
export interface AgentResult {
	finalMessage: string
	iterations: number
	flagCaptured: string | null
}

/**
 * Core runtime configuration shared across tasks and loops.
 *
 * Input:
 * - OpenAI credentials and defaults
 * - AI Devs verification configuration
 * - any task-specific custom fields merged on top
 *
 * Output:
 * - concrete runtime config used by `createOpenAIClient()` and `verifyAnswer()`
 *
 * @example
 * ```ts
 * const config: CoreConfig = {
 *   openaiApiKey: 'sk-xxx',
 *   openaiModel: 'gpt-5-mini',
 *   aiDevsApiKey: 'devs-xxx',
 *   verifyEndpoint: 'https://example.com/verify',
 *   taskName: 'warehouse',
 * }
 * ```
 */
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

/**
 * Result returned from the verification endpoint.
 *
 * Output:
 * - `responseText`: normalized string form of the verification response
 * - `flag`: extracted flag if present
 * - `data`: original response payload
 *
 * @example
 * ```ts
 * const verifyResult: VerifyResult = {
 *   responseText: 'OK {FLG:abc123}',
 *   flag: '{FLG:abc123}',
 *   data: { code: 200 },
 * }
 * ```
 */
export interface VerifyResult {
	responseText: string
	flag: string | null
	data: unknown
}

/**
 * Mapping of custom config keys to required environment variable names.
 *
 * Input:
 * - object keys become config keys
 * - values are env var names that must exist
 *
 * Output:
 * - used by `createConfig()` to extend `CoreConfig`
 *
 * @example
 * ```ts
 * const requiredEnv: CreateConfigRequiredEnv = {
 *   warehouseUrl: 'WAREHOUSE_URL',
 * }
 * ```
 */
export type CreateConfigRequiredEnv = Record<string, string>

/**
 * Descriptor for an optional custom environment variable.
 *
 * Input:
 * - plain string: env var name
 * - object: env var name plus optional fallback
 *
 * Output:
 * - consumed by `createConfig()` when building optional custom fields
 *
 * @example
 * ```ts
 * const value: CreateConfigOptionalEnvValue = {
 *   name: 'REGION',
 *   fallback: 'eu',
 * }
 * ```
 */
export type CreateConfigOptionalEnvValue = string | { name: string; fallback?: string }

/**
 * Mapping of custom config keys to optional environment variable descriptors.
 *
 * Input:
 * - object keys become config keys
 * - values are optional env descriptors
 *
 * Output:
 * - used by `createConfig()` to extend `CoreConfig` with optional fields
 *
 * @example
 * ```ts
 * const optionalEnv: CreateConfigOptionalEnv = {
 *   region: { name: 'REGION', fallback: 'eu' },
 * }
 * ```
 */
export type CreateConfigOptionalEnv = Record<string, CreateConfigOptionalEnvValue>

/**
 * Internal helper type used as the default generic value for empty config extensions.
 *
 * Output:
 * - represents an object with no allowed keys
 *
 * @example
 * ```ts
 * type Empty = EmptyConfigFields
 * ```
 */
type EmptyConfigFields = Record<string, never>

/**
 * Resolves custom config fields derived from `requiredEnv` and `optionalEnv` mappings.
 *
 * Input:
 * - `RequiredEnv`: keys become required `string` fields
 * - `OptionalEnv`: keys become `string | undefined` fields
 *
 * Output:
 * - merged custom field map produced by `createConfig()`
 *
 * @example
 * ```ts
 * type Resolved = CreateConfigResolvedEnv<
 *   { warehouseUrl: 'WAREHOUSE_URL' },
 *   { region: 'REGION' }
 * >
 * // { warehouseUrl: string; region: string | undefined }
 * ```
 */
export type CreateConfigResolvedEnv<
	RequiredEnv extends CreateConfigRequiredEnv = EmptyConfigFields,
	OptionalEnv extends CreateConfigOptionalEnv = EmptyConfigFields,
> = {
	[K in keyof RequiredEnv]: string
} & {
	[K in keyof OptionalEnv]: string | undefined
}

/**
 * Options accepted by `createConfig()`.
 *
 * Input:
 * - `overrides`: explicit config values that win over env resolution
 * - `requiredEnv`: custom required env mappings
 * - `optionalEnv`: custom optional env mappings
 *
 * Output:
 * - a strongly typed input object for `createConfig()`
 *
 * @example
 * ```ts
 * const options: CreateConfigOptions = {
 *   overrides: { openaiModel: 'gpt-5-mini' },
 *   requiredEnv: { warehouseUrl: 'WAREHOUSE_URL' },
 *   optionalEnv: { region: { name: 'REGION', fallback: 'eu' } },
 * }
 * ```
 */
export interface CreateConfigOptions<
	Overrides extends Record<string, unknown> = EmptyConfigFields,
	RequiredEnv extends CreateConfigRequiredEnv = EmptyConfigFields,
	OptionalEnv extends CreateConfigOptionalEnv = EmptyConfigFields,
> {
	overrides?: Partial<CoreConfig> & Overrides
	requiredEnv?: RequiredEnv
	optionalEnv?: OptionalEnv
}

/**
 * Final config shape returned from `createConfig()`.
 *
 * Input:
 * - `Overrides`: extra explicit config fields
 * - `RequiredEnv`: custom required env map
 * - `OptionalEnv`: custom optional env map
 *
 * Output:
 * - `CoreConfig` merged with overrides and resolved custom env-driven fields
 *
 * @example
 * ```ts
 * type Config = CreateConfigResult<
 *   { mode: 'prod' },
 *   { warehouseUrl: 'WAREHOUSE_URL' },
 *   { region: 'REGION' }
 * >
 * ```
 */
export type CreateConfigResult<
	Overrides extends Record<string, unknown> = EmptyConfigFields,
	RequiredEnv extends CreateConfigRequiredEnv = EmptyConfigFields,
	OptionalEnv extends CreateConfigOptionalEnv = EmptyConfigFields,
> = CoreConfig & Overrides & CreateConfigResolvedEnv<RequiredEnv, OptionalEnv>
