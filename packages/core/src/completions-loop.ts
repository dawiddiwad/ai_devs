import type {
	ChatCompletionContentPart,
	ChatCompletionMessageParam,
	ChatCompletionTool,
} from 'openai/resources/chat/completions'
import { logger } from './logger.js'
import { safelyObserve } from './observability.js'
import { appendToolResultForCompletions, createToolResultAttachmentParts, getToolResultText } from './tool-result.js'
import { captureFlag } from './verify.js'
import { createOpenAIClient } from './openai-client.js'
import type {
	AgentObservationHandle,
	AgentCompletionsConfig,
	AgentMessageHandlerResult,
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
	lastMessage: string
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
	result: AgentMessageHandlerResult | AgentToolCallHandlerResult | AgentNoToolCallsHandlerResult
): result is
	| (Extract<AgentMessageHandlerResult, { messages?: ChatCompletionMessageParam[] }> & {
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

function createLoopExit(finalMessage: string, iterationIndex: number, flagCaptured: string | null): AgentResult {
	return { finalMessage, iterations: iterationIndex + 1, flagCaptured }
}

function resolveFinalState(
	config: AgentCompletionsConfig,
	finalMessage: string,
	iterationIndex: number,
	isFinal: boolean
): { flagCaptured: string | null; exit: LoopExit } {
	const flagCaptured = captureFlag(finalMessage)
	if (flagCaptured) {
		if (config.exitOnFlag !== false) {
			process.exit(0)
		}

		return {
			flagCaptured,
			exit: createLoopExit(finalMessage, iterationIndex, flagCaptured),
		}
	}

	if (isFinal) {
		return {
			flagCaptured: null,
			exit: createLoopExit(finalMessage, iterationIndex, null),
		}
	}

	return { flagCaptured: null, exit: null }
}

function createCompletionsRequest(
	model: string,
	temperature: number | undefined,
	messages: ChatCompletionMessageParam[],
	toolDefs: ChatCompletionTool[]
) {
	return {
		model,
		messages,
		tools: toolDefs.length > 0 ? toolDefs : undefined,
		temperature,
	}
}

function appendAssistantMessage(
	messages: ChatCompletionMessageParam[],
	message: ChatCompletionMessageParam
): ChatCompletionMessageParam[] {
	return [...messages, message]
}

function replaceLastAssistantMessageContent(
	messages: ChatCompletionMessageParam[],
	content: string
): ChatCompletionMessageParam[] {
	const lastMessage = messages[messages.length - 1]

	if (!lastMessage || lastMessage.role !== 'assistant') {
		return messages
	}

	return [...messages.slice(0, -1), { ...lastMessage, content }]
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

async function resolveMessageHandling(
	config: AgentCompletionsConfig,
	iterationIndex: number,
	content: string,
	messages: ChatCompletionMessageParam[]
): Promise<{ content: string; messages: ChatCompletionMessageParam[]; isFinal: boolean }> {
	const handled = await config.handleMessage?.({ api: 'completions', iterationIndex, content, messages })

	if (!handled) {
		return { content, messages, isFinal: false }
	}

	const nextContent = handled.content ?? content

	return {
		content: nextContent,
		messages: hasMessagesAccumulator(handled)
			? handled.messages
			: replaceLastAssistantMessageContent(messages, nextContent),
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
	content: string,
	messages: ChatCompletionMessageParam[]
): Promise<{ content: string; messages: ChatCompletionMessageParam[]; shouldContinue: boolean; isFinal: boolean }> {
	const handled = await config.handleNoToolCalls?.({ api: 'completions', iterationIndex, content, messages })

	if (!handled) {
		return { content, messages, shouldContinue: false, isFinal: false }
	}

	if (handled.action === 'final') {
		return {
			content: handled.content ?? content,
			messages: hasMessagesAccumulator(handled) ? handled.messages : messages,
			shouldContinue: false,
			isFinal: true,
		}
	}

	if (!hasMessagesAccumulator(handled)) {
		throw new Error('handleNoToolCalls must return messages when action is continue for the completions API')
	}

	return {
		content: handled.content ?? content,
		messages: handled.messages,
		shouldContinue: true,
		isFinal: false,
	}
}

async function handleCompletionsMessage(
	config: AgentCompletionsConfig,
	iterationIndex: number,
	content: string,
	state: CompletionsLoopState,
	runHandle: AgentObservationHandle | undefined
): Promise<CompletionsMessagePhaseResult> {
	const handledMessage = await resolveMessageHandling(config, iterationIndex, content, state.messages)
	const nextState = {
		...state,
		lastMessage: handledMessage.content,
		messages: handledMessage.messages,
	}

	logger.agent('info', 'Agent message', { content: handledMessage.content.slice(0, 200) })
	await config.onMessage?.(handledMessage.content)

	const { flagCaptured, exit } = resolveFinalState(
		config,
		handledMessage.content,
		iterationIndex,
		handledMessage.isFinal
	)
	await safelyObserve(
		'onMessage',
		() =>
			config.observability?.onMessage?.({
				api: 'completions',
				runHandle,
				iterationIndex,
				content: handledMessage.content,
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
			getToolResultText(handledToolCall.result),
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
		state.lastMessage,
		state.messages
	)
	const nextState = {
		...state,
		lastMessage: handledNoToolCalls.content,
		messages: handledNoToolCalls.messages,
	}
	const { flagCaptured, exit } = resolveFinalState(
		config,
		handledNoToolCalls.content,
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
		lastMessage: '',
		flagCaptured: null,
		messages: [
			{ role: 'system', content: config.systemPrompt },
			{ role: 'user', content: config.userPrompt },
		],
	}

	for (let iterationIndex = 0; iterationIndex < maxIterations; iterationIndex++) {
		logger.agent('info', `Iteration ${iterationIndex + 1}/${maxIterations}`)

		const request = createCompletionsRequest(model, temperature, state.messages, toolDefs)
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
			response = await client.chat.completions.create(request)
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
			return createLoopExit(state.lastMessage, iterationIndex, state.flagCaptured)
		}

		state = { ...state, messages: appendAssistantMessage(state.messages, message) }

		if (message.content) {
			const messagePhase = await handleCompletionsMessage(
				config,
				iterationIndex,
				message.content,
				state,
				runHandle
			)
			state = messagePhase.state

			if (messagePhase.exit) {
				return messagePhase.exit
			}
		}

		if (!message.tool_calls?.length) {
			const noToolCallsPhase = await handleCompletionsNoToolCalls(config, iterationIndex, state)
			state = noToolCallsPhase.state

			if (noToolCallsPhase.exit) {
				return noToolCallsPhase.exit
			}

			if (noToolCallsPhase.shouldContinue) {
				continue
			}

			logger.agent('info', 'No tool calls — agent finished')
			logger.agent('info', 'Response', { content: JSON.stringify(response, null, 2) })
			return createLoopExit(state.lastMessage, iterationIndex, state.flagCaptured)
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
	return { finalMessage: state.lastMessage, iterations: maxIterations, flagCaptured: state.flagCaptured }
}
