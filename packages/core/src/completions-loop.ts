import type {
	ChatCompletionAudio,
	ChatCompletionAudioParam,
	ChatCompletionContentPart,
	ChatCompletionMessage,
	ChatCompletionMessageParam,
	ChatCompletionTool,
} from 'openai/resources/chat/completions'
import { logger } from './logger.js'
import { safelyObserve } from './observability.js'
import { withOpenAIRetry } from './openai-retry.js'
import { appendToolResultForCompletions, createToolResultAttachmentParts, getToolResultText } from './tool-result.js'
import { captureFlag } from './verify.js'
import { createOpenAIClient } from './openai-client.js'
import type {
	AgentObservationHandle,
	AgentCompletionsConfig,
	AgentOutput,
	AgentOutputHandlerResult,
	AgentNoToolCallsHandlerResult,
	AgentResult,
	AgentToolResult,
	AgentToolCallHandlerResult,
} from './types.js'

type LoopExit = AgentResult | null

type CompletionsFunctionToolCall = {
	id: string
	function: {
		name: string
		arguments: string
	}
}

type CompletionsLoopState = {
	lastOutput: AgentOutput
	flagCaptured: string | null
	messages: ChatCompletionMessageParam[]
}

type CompletionsMessagePhaseResult = {
	state: CompletionsLoopState
	exit: LoopExit
}

type CompletionsToolCallPhaseResult = {
	state: CompletionsLoopState
	followUpAttachmentParts: ChatCompletionContentPart[]
	exit: LoopExit
}

type CompletionsNoToolCallsPhaseResult = {
	state: CompletionsLoopState
	shouldContinue: boolean
	exit: LoopExit
}

function hasMessagesAccumulator(
	result: AgentOutputHandlerResult | AgentToolCallHandlerResult | AgentNoToolCallsHandlerResult
): result is
	| (Extract<AgentOutputHandlerResult, { messages?: ChatCompletionMessageParam[] }> & {
			messages: ChatCompletionMessageParam[]
	  })
	| (Extract<AgentToolCallHandlerResult, { messages?: ChatCompletionMessageParam[] }> & {
			messages: ChatCompletionMessageParam[]
	  })
	| (Extract<AgentNoToolCallsHandlerResult, { messages?: ChatCompletionMessageParam[] }> & {
			messages: ChatCompletionMessageParam[]
	  }) {
	return !!result && typeof result === 'object' && 'messages' in result && result.messages !== undefined
}

function createEmptyOutput(): AgentOutput {
	return { text: '' }
}

function createLoopExit(output: AgentOutput, iterationIndex: number, flagCaptured: string | null): AgentResult {
	return { output, iterations: iterationIndex + 1, flagCaptured }
}

function resolveFinalState(
	config: AgentCompletionsConfig,
	output: AgentOutput,
	iterationIndex: number,
	isFinal: boolean
): { flagCaptured: string | null; exit: LoopExit } {
	const flagCaptured = captureFlag(output.text)
	if (flagCaptured) {
		if (config.exitOnFlag !== false) {
			process.exit(0)
		}

		return {
			flagCaptured,
			exit: createLoopExit(output, iterationIndex, flagCaptured),
		}
	}

	if (isFinal) {
		return {
			flagCaptured: null,
			exit: createLoopExit(output, iterationIndex, null),
		}
	}

	return { flagCaptured: null, exit: null }
}

function createCompletionsRequest(
	model: string,
	temperature: number | undefined,
	config: AgentCompletionsConfig,
	messages: ChatCompletionMessageParam[],
	toolDefs: ChatCompletionTool[]
) {
	const outputAudio = config.output?.audio
	const outputModalities = config.output?.modalities ?? (outputAudio ? ['text', 'audio'] : undefined)

	if (outputAudio && outputModalities && !outputModalities.includes('audio')) {
		throw new Error('output.audio requires output.modalities to include "audio" in the completions loop')
	}

	if (outputModalities?.includes('audio') && !outputAudio) {
		throw new Error('output.modalities includes "audio" but output.audio is missing in the completions loop')
	}

	const audioRequest: ChatCompletionAudioParam | undefined = outputAudio
		? {
				format: outputAudio.format === 'pcm' ? 'pcm16' : outputAudio.format,
				voice: outputAudio.voice,
			}
		: undefined

	return {
		model,
		messages,
		tools: toolDefs.length > 0 ? toolDefs : undefined,
		tool_choice: toolDefs.length > 0 ? (config.toolChoice ?? 'auto') : undefined,
		modalities: outputModalities,
		audio: audioRequest,
		reasoning_effort: config.reasoning?.effort,
		service_tier: config.serviceTier,
		temperature,
	}
}

function extractCompletionsContentText(content: ChatCompletionMessageParam['content']): string {
	if (typeof content === 'string') {
		return content
	}

	if (!Array.isArray(content)) {
		return ''
	}

	return content
		.map((part) => {
			if (part.type === 'text') {
				return part.text
			}

			if (part.type === 'refusal') {
				return part.refusal
			}

			return ''
		})
		.join('')
}

function normalizeCompletionsAudioFormat(
	audio: ChatCompletionAudio | undefined,
	config: AgentCompletionsConfig
): AgentOutput['audio'] {
	if (!audio) {
		return undefined
	}

	const configuredFormat = config.output?.audio?.format
	const format = configuredFormat === 'pcm' ? 'pcm16' : (configuredFormat ?? 'mp3')

	return {
		base64: audio.data,
		format,
		transcript: audio.transcript,
		id: audio.id,
	}
}

function extractCompletionsOutput(message: ChatCompletionMessage, config: AgentCompletionsConfig): AgentOutput | null {
	const contentText = extractCompletionsContentText(message.content)
	const audio = normalizeCompletionsAudioFormat(message.audio ?? undefined, config)
	const text = contentText || message.refusal || audio?.transcript || ''

	if (!text && !audio) {
		return null
	}

	return {
		text,
		...(audio ? { audio } : {}),
	}
}

function createAssistantHistoryMessage(message: ChatCompletionMessage): ChatCompletionMessageParam {
	return {
		role: 'assistant',
		content: message.content,
		...(message.refusal ? { refusal: message.refusal } : {}),
		...(message.audio?.id ? { audio: { id: message.audio.id } } : {}),
		...(message.tool_calls ? { tool_calls: message.tool_calls } : {}),
		...(message.function_call ? { function_call: message.function_call } : {}),
	}
}

function appendAssistantMessage(
	messages: ChatCompletionMessageParam[],
	message: ChatCompletionMessageParam
): ChatCompletionMessageParam[] {
	return [...messages, message]
}

function replaceLastAssistantMessageOutput(
	messages: ChatCompletionMessageParam[],
	output: AgentOutput
): ChatCompletionMessageParam[] {
	const lastMessage = messages[messages.length - 1]

	if (!lastMessage || lastMessage.role !== 'assistant') {
		return messages
	}

	return [
		...messages.slice(0, -1),
		{
			...lastMessage,
			content: output.text,
			...(output.audio?.id ? { audio: { id: output.audio.id } } : {}),
		},
	]
}

function appendCompletionsToolError(
	messages: ChatCompletionMessageParam[],
	toolCallId: string,
	error: unknown
): ChatCompletionMessageParam[] {
	const errorMessage = error instanceof Error ? error.message : String(error)

	logger.tool('error', 'Tool error', { toolCallId, error: errorMessage })

	return appendToolResultForCompletions(messages, toolCallId, JSON.stringify({ error: errorMessage }))
}

function createDefaultToolExecutor(
	config: AgentCompletionsConfig,
	name: string,
	args: unknown
): () => Promise<AgentToolResult> {
	const tool = config.tools.find((candidate) => candidate.definition.name === name)
	let defaultResultPromise: Promise<AgentToolResult> | undefined

	return () => {
		if (!defaultResultPromise) {
			defaultResultPromise = tool
				? tool.execute(args)
				: Promise.resolve(JSON.stringify({ error: `Unknown tool: ${name}` }))
		}

		return defaultResultPromise
	}
}

async function resolveOutputHandling(
	config: AgentCompletionsConfig,
	iterationIndex: number,
	output: AgentOutput,
	messages: ChatCompletionMessageParam[]
): Promise<{ output: AgentOutput; messages: ChatCompletionMessageParam[]; isFinal: boolean }> {
	const handled = await config.handleOutput?.({ api: 'completions', iterationIndex, output, messages })

	if (!handled) {
		return { output, messages, isFinal: false }
	}

	const nextOutput = handled.output ?? output

	return {
		output: nextOutput,
		messages: hasMessagesAccumulator(handled)
			? handled.messages
			: replaceLastAssistantMessageOutput(messages, nextOutput),
		isFinal: handled.action === 'final',
	}
}

async function resolveToolCallHandling(
	config: AgentCompletionsConfig,
	iterationIndex: number,
	name: string,
	args: unknown,
	messages: ChatCompletionMessageParam[],
	executeDefault: () => Promise<AgentToolResult>
): Promise<{
	result: AgentToolResult
	messages: ChatCompletionMessageParam[]
	messagesWereReplaced: boolean
	isFinal: boolean
}> {
	const handled = await config.handleToolCall?.({
		api: 'completions',
		iterationIndex,
		name,
		args,
		messages,
		executeDefault,
	})
	const messagesWereReplaced = hasMessagesAccumulator(handled)

	if (!handled) {
		return { result: await executeDefault(), messages, messagesWereReplaced: false, isFinal: false }
	}

	return {
		result: handled.action === 'final' ? handled.result : (handled.result ?? (await executeDefault())),
		messages: messagesWereReplaced ? handled.messages : messages,
		messagesWereReplaced,
		isFinal: handled.action === 'final',
	}
}

async function resolveNoToolCallsHandling(
	config: AgentCompletionsConfig,
	iterationIndex: number,
	output: AgentOutput,
	messages: ChatCompletionMessageParam[]
): Promise<{ output: AgentOutput; messages: ChatCompletionMessageParam[]; shouldContinue: boolean; isFinal: boolean }> {
	const handled = await config.handleNoToolCalls?.({ api: 'completions', iterationIndex, output, messages })

	if (!handled) {
		return { output, messages, shouldContinue: false, isFinal: false }
	}

	if (handled.action === 'final') {
		return {
			output: handled.output ?? output,
			messages: hasMessagesAccumulator(handled) ? handled.messages : messages,
			shouldContinue: false,
			isFinal: true,
		}
	}

	if (!hasMessagesAccumulator(handled)) {
		throw new Error('handleNoToolCalls must return messages when action is continue for the completions API')
	}

	return {
		output: handled.output ?? output,
		messages: handled.messages,
		shouldContinue: true,
		isFinal: false,
	}
}

async function handleCompletionsOutput(
	config: AgentCompletionsConfig,
	iterationIndex: number,
	output: AgentOutput,
	state: CompletionsLoopState,
	runHandle: AgentObservationHandle | undefined
): Promise<CompletionsMessagePhaseResult> {
	const handledOutput = await resolveOutputHandling(config, iterationIndex, output, state.messages)
	const nextState = {
		...state,
		lastOutput: handledOutput.output,
		messages: handledOutput.messages,
	}

	logger.agent('info', 'Agent output', {
		text: handledOutput.output.text.slice(0, 200),
		hasAudio: !!handledOutput.output.audio,
	})
	await config.onOutput?.(handledOutput.output)

	const { flagCaptured, exit } = resolveFinalState(
		config,
		handledOutput.output,
		iterationIndex,
		handledOutput.isFinal
	)
	await safelyObserve(
		'onOutput',
		() =>
			config.observability?.onOutput?.({
				api: 'completions',
				runHandle,
				iterationIndex,
				output: handledOutput.output,
				isFinal: exit !== null,
			}),
		undefined
	)

	return {
		state: flagCaptured ? { ...nextState, flagCaptured } : nextState,
		exit,
	}
}

async function handleCompletionsToolCall(
	config: AgentCompletionsConfig,
	iterationIndex: number,
	toolCall: CompletionsFunctionToolCall,
	state: CompletionsLoopState,
	runHandle: AgentObservationHandle | undefined
): Promise<CompletionsToolCallPhaseResult> {
	logger.tool('info', `Tool call: ${toolCall.function.name}`, {
		args: toolCall.function.arguments.slice(0, 200),
	})
	const toolHandle = await safelyObserve(
		'onToolStart',
		() =>
			config.observability?.onToolStart?.({
				api: 'completions',
				runHandle,
				iterationIndex,
				name: toolCall.function.name,
				args: toolCall.function.arguments,
			}),
		undefined
	)

	try {
		const parsedArgs = JSON.parse(toolCall.function.arguments)
		const executeDefault = createDefaultToolExecutor(config, toolCall.function.name, parsedArgs)
		const handledToolCall = await resolveToolCallHandling(
			config,
			iterationIndex,
			toolCall.function.name,
			parsedArgs,
			state.messages,
			executeDefault
		)
		const nextMessages = handledToolCall.messagesWereReplaced
			? handledToolCall.messages
			: appendToolResultForCompletions(handledToolCall.messages, toolCall.id, handledToolCall.result)
		const nextState = { ...state, messages: nextMessages }
		const followUpAttachmentParts = createToolResultAttachmentParts(
			toolCall.function.name,
			toolCall.id,
			handledToolCall.result
		)

		await config.onToolCall?.(toolCall.function.name, parsedArgs, handledToolCall.result)
		await safelyObserve(
			'onToolEnd',
			() =>
				config.observability?.onToolEnd?.({
					api: 'completions',
					runHandle,
					toolHandle,
					iterationIndex,
					name: toolCall.function.name,
					args: parsedArgs,
					result: handledToolCall.result,
				}),
			undefined
		)

		const { flagCaptured, exit } = resolveFinalState(
			config,
			{ text: getToolResultText(handledToolCall.result) },
			iterationIndex,
			handledToolCall.isFinal
		)

		return {
			state: flagCaptured ? { ...nextState, flagCaptured } : nextState,
			followUpAttachmentParts,
			exit,
		}
	} catch (error) {
		await safelyObserve(
			'onToolError',
			() =>
				config.observability?.onToolError?.({
					api: 'completions',
					runHandle,
					toolHandle,
					iterationIndex,
					name: toolCall.function.name,
					args: toolCall.function.arguments,
					errorMessage: error instanceof Error ? error.message : String(error),
				}),
			undefined
		)
		return {
			state: {
				...state,
				messages: appendCompletionsToolError(state.messages, toolCall.id, error),
			},
			followUpAttachmentParts: [],
			exit: null,
		}
	}
}

async function handleCompletionsNoToolCalls(
	config: AgentCompletionsConfig,
	iterationIndex: number,
	state: CompletionsLoopState
): Promise<CompletionsNoToolCallsPhaseResult> {
	const handledNoToolCalls = await resolveNoToolCallsHandling(
		config,
		iterationIndex,
		state.lastOutput,
		state.messages
	)
	const nextState = {
		...state,
		lastOutput: handledNoToolCalls.output,
		messages: handledNoToolCalls.messages,
	}
	const { flagCaptured, exit } = resolveFinalState(
		config,
		handledNoToolCalls.output,
		iterationIndex,
		handledNoToolCalls.isFinal
	)

	return {
		state: flagCaptured ? { ...nextState, flagCaptured } : nextState,
		shouldContinue: handledNoToolCalls.shouldContinue,
		exit,
	}
}

export async function runCompletionsLoop(
	client: ReturnType<typeof createOpenAIClient>,
	model: string,
	maxIterations: number,
	temperature: number | undefined,
	config: AgentCompletionsConfig,
	runHandle?: AgentObservationHandle
): Promise<AgentResult> {
	const toolDefs: ChatCompletionTool[] = config.tools.map((tool) => ({
		type: 'function' as const,
		function: {
			name: tool.definition.name,
			description: tool.definition.description ?? '',
			parameters: tool.definition.parameters as Record<string, unknown>,
			strict: tool.definition.strict,
		},
	}))

	let state: CompletionsLoopState = {
		lastOutput: createEmptyOutput(),
		flagCaptured: null,
		messages: [
			{ role: 'system', content: config.systemPrompt },
			{ role: 'user', content: config.userPrompt },
		],
	}

	for (let iterationIndex = 0; iterationIndex < maxIterations; iterationIndex++) {
		logger.agent('info', `Iteration ${iterationIndex + 1}/${maxIterations}`)

		const request = createCompletionsRequest(model, temperature, config, state.messages, toolDefs)
		const modelHandle = await safelyObserve(
			'onModelStart',
			() =>
				config.observability?.onModelStart?.({
					api: 'completions',
					runHandle,
					model,
					iterationIndex,
					request,
				}),
			undefined
		)

		let response: Awaited<ReturnType<typeof client.chat.completions.create>>
		try {
			response = await withOpenAIRetry('chat.completions.create', () => client.chat.completions.create(request))
			await safelyObserve(
				'onModelEnd',
				() =>
					config.observability?.onModelEnd?.({
						api: 'completions',
						runHandle,
						modelHandle,
						model,
						iterationIndex,
						request,
						response,
					}),
				undefined
			)
		} catch (error) {
			await safelyObserve(
				'onModelError',
				() =>
					config.observability?.onModelError?.({
						api: 'completions',
						runHandle,
						modelHandle,
						model,
						iterationIndex,
						request,
						errorMessage: error instanceof Error ? error.message : String(error),
					}),
				undefined
			)
			throw error
		}
		const message = response.choices[0]?.message

		if (!message) {
			logger.agent('error', 'No message in response')
			return createLoopExit(state.lastOutput, iterationIndex, state.flagCaptured)
		}

		state = {
			...state,
			messages: appendAssistantMessage(state.messages, createAssistantHistoryMessage(message)),
		}

		const output = extractCompletionsOutput(message, config)

		if (output) {
			const messagePhase = await handleCompletionsOutput(config, iterationIndex, output, state, runHandle)
			state = messagePhase.state

			if (messagePhase.exit) {
				return messagePhase.exit
			}
		}

		if (!message.tool_calls?.length) {
			if (!output) {
				state = { ...state, lastOutput: createEmptyOutput() }
			}

			const noToolCallsPhase = await handleCompletionsNoToolCalls(config, iterationIndex, state)
			state = noToolCallsPhase.state

			if (noToolCallsPhase.exit) {
				return noToolCallsPhase.exit
			}

			if (noToolCallsPhase.shouldContinue) {
				continue
			}

			logger.agent('info', 'No tool calls — agent finished')
			logger.agent('info', 'Message', { content: JSON.stringify(response.choices[0]?.message.content, null, 2) })
			return createLoopExit(state.lastOutput, iterationIndex, state.flagCaptured)
		}

		const followUpAttachmentParts: ChatCompletionContentPart[] = []

		for (const toolCall of message.tool_calls) {
			if (toolCall.type !== 'function') {
				continue
			}

			const toolCallPhase = await handleCompletionsToolCall(config, iterationIndex, toolCall, state, runHandle)
			state = toolCallPhase.state
			followUpAttachmentParts.push(...toolCallPhase.followUpAttachmentParts)

			if (toolCallPhase.exit) {
				return toolCallPhase.exit
			}
		}

		if (followUpAttachmentParts.length > 0) {
			state = {
				...state,
				messages: [...state.messages, { role: 'user', content: followUpAttachmentParts }],
			}
		}
	}

	logger.agent('error', 'Max iterations reached')
	return { output: state.lastOutput, iterations: maxIterations, flagCaptured: state.flagCaptured }
}
