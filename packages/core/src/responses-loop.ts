import type { ResponseInput, Tool } from 'openai/resources/responses/responses'
import { logger } from './logger.js'
import { captureFlag } from './verify.js'
import { createOpenAIClient } from './openai-client.js'
import type {
	AgentConfig,
	AgentMessageHandlerResult,
	AgentNoToolCallsHandlerResult,
	AgentResult,
	AgentToolCallHandlerResult,
} from './types.js'

type LoopExit = AgentResult | null

type ResponsesFunctionCallItem = {
	call_id: string
	name: string
	arguments: string
}

type ResponsesLoopState = {
	lastMessage: string
	flagCaptured: string | null
	inputMessages: ResponseInput
}

type ResponsesMessagePhaseResult = {
	state: ResponsesLoopState
	exit: LoopExit
}

type ResponsesToolCallPhaseResult = {
	state: ResponsesLoopState
	exit: LoopExit
}

type ResponsesNoToolCallsPhaseResult = {
	state: ResponsesLoopState
	shouldContinue: boolean
	exit: LoopExit
}

function hasInputAccumulator(
	result: AgentMessageHandlerResult | AgentToolCallHandlerResult | AgentNoToolCallsHandlerResult
): result is
	| (Extract<AgentMessageHandlerResult, { input?: ResponseInput }> & { input: ResponseInput })
	| (Extract<AgentToolCallHandlerResult, { input?: ResponseInput }> & { input: ResponseInput })
	| (Extract<AgentNoToolCallsHandlerResult, { input?: ResponseInput }> & { input: ResponseInput }) {
	return !!result && typeof result === 'object' && 'input' in result && result.input !== undefined
}

function createLoopExit(finalMessage: string, iterationIndex: number, flagCaptured: string | null): AgentResult {
	return { finalMessage, iterations: iterationIndex + 1, flagCaptured }
}

function resolveFinalState(
	config: AgentConfig,
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

function createResponsesRequest(
	model: string,
	temperature: number | undefined,
	config: AgentConfig,
	conversationId: string,
	input: ResponseInput,
	toolDefs: Tool[]
) {
	return {
		model,
		conversation: conversationId,
		tools: toolDefs,
		tool_choice: config.toolChoice ?? 'auto',
		temperature,
		input,
		...(config.reasoning ? { reasoning: config.reasoning } : {}),
		context_management: [{ type: 'compaction' as const, compact_threshold: config.compactThreshold ?? 100000 }],
		service_tier: config.serviceTier,
	}
}

function extractResponseMessageText(contentItems: Array<{ type: string; text?: string }>): string {
	return contentItems
		.filter((contentItem) => contentItem.type === 'output_text')
		.map((contentItem) => (typeof contentItem.text === 'string' ? contentItem.text : ''))
		.join('')
}

function appendResponsesToolOutput(input: ResponseInput, callId: string, output: string): ResponseInput {
	return [...input, { type: 'function_call_output', call_id: callId, output }]
}

function appendResponsesToolError(input: ResponseInput, callId: string, error: unknown): ResponseInput {
	const errorMessage = error instanceof Error ? error.message : String(error)

	logger.tool('error', 'Tool error', { callId, error: errorMessage })

	return appendResponsesToolOutput(input, callId, JSON.stringify({ error: errorMessage }))
}

function createDefaultToolExecutor(config: AgentConfig, name: string, args: unknown): () => Promise<string> {
	const tool = config.tools.find((candidate) => candidate.definition.name === name)
	let defaultResultPromise: Promise<string> | undefined

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
	config: AgentConfig,
	iterationIndex: number,
	content: string,
	input: ResponseInput
): Promise<{ content: string; input: ResponseInput; isFinal: boolean }> {
	const handled = await config.handleMessage?.({ api: 'responses', iterationIndex, content, input })

	if (!handled) {
		return { content, input, isFinal: false }
	}

	return {
		content: handled.content ?? content,
		input: hasInputAccumulator(handled) ? handled.input : input,
		isFinal: handled.action === 'final',
	}
}

async function resolveToolCallHandling(
	config: AgentConfig,
	iterationIndex: number,
	name: string,
	args: unknown,
	input: ResponseInput,
	executeDefault: () => Promise<string>
): Promise<{ result: string; input: ResponseInput; inputWasReplaced: boolean; isFinal: boolean }> {
	const handled = await config.handleToolCall?.({
		api: 'responses',
		iterationIndex,
		name,
		args,
		input,
		executeDefault,
	})
	const inputWasReplaced = hasInputAccumulator(handled)

	if (!handled) {
		return { result: await executeDefault(), input, inputWasReplaced: false, isFinal: false }
	}

	return {
		result: handled.action === 'final' ? handled.result : (handled.result ?? (await executeDefault())),
		input: inputWasReplaced ? handled.input : input,
		inputWasReplaced,
		isFinal: handled.action === 'final',
	}
}

async function resolveNoToolCallsHandling(
	config: AgentConfig,
	iterationIndex: number,
	content: string,
	input: ResponseInput
): Promise<{ content: string; input: ResponseInput; shouldContinue: boolean; isFinal: boolean }> {
	const handled = await config.handleNoToolCalls?.({ api: 'responses', iterationIndex, content, input })

	if (!handled) {
		return { content, input, shouldContinue: false, isFinal: false }
	}

	if (handled.action === 'final') {
		return {
			content: handled.content ?? content,
			input: hasInputAccumulator(handled) ? handled.input : input,
			shouldContinue: false,
			isFinal: true,
		}
	}

	if (!hasInputAccumulator(handled)) {
		throw new Error('handleNoToolCalls must return input when action is continue for the responses API')
	}

	return {
		content: handled.content ?? content,
		input: handled.input,
		shouldContinue: true,
		isFinal: false,
	}
}

async function handleResponsesMessage(
	config: AgentConfig,
	iterationIndex: number,
	text: string,
	state: ResponsesLoopState
): Promise<ResponsesMessagePhaseResult> {
	const handledMessage = await resolveMessageHandling(config, iterationIndex, text, state.inputMessages)
	const nextState = {
		...state,
		lastMessage: handledMessage.content,
		inputMessages: handledMessage.input,
	}

	logger.agent('info', 'Agent message', { content: handledMessage.content.slice(0, 200) })
	await config.onMessage?.(handledMessage.content)

	const { flagCaptured, exit } = resolveFinalState(
		config,
		handledMessage.content,
		iterationIndex,
		handledMessage.isFinal
	)

	return {
		state: flagCaptured ? { ...nextState, flagCaptured } : nextState,
		exit,
	}
}

async function handleResponsesToolCall(
	config: AgentConfig,
	iterationIndex: number,
	item: ResponsesFunctionCallItem,
	state: ResponsesLoopState
): Promise<ResponsesToolCallPhaseResult> {
	logger.tool('info', `Tool call: ${item.name}`, { args: item.arguments.slice(0, 200) })

	try {
		const parsedArgs = JSON.parse(item.arguments)
		const executeDefault = createDefaultToolExecutor(config, item.name, parsedArgs)
		const handledToolCall = await resolveToolCallHandling(
			config,
			iterationIndex,
			item.name,
			parsedArgs,
			state.inputMessages,
			executeDefault
		)
		const nextInputMessages = handledToolCall.inputWasReplaced
			? handledToolCall.input
			: appendResponsesToolOutput(handledToolCall.input, item.call_id, handledToolCall.result)
		const nextState = { ...state, inputMessages: nextInputMessages }

		await config.onToolCall?.(item.name, parsedArgs, handledToolCall.result)

		const { flagCaptured, exit } = resolveFinalState(
			config,
			handledToolCall.result,
			iterationIndex,
			handledToolCall.isFinal
		)

		return {
			state: flagCaptured ? { ...nextState, flagCaptured } : nextState,
			exit,
		}
	} catch (error) {
		return {
			state: {
				...state,
				inputMessages: appendResponsesToolError(state.inputMessages, item.call_id, error),
			},
			exit: null,
		}
	}
}

async function handleResponsesNoToolCalls(
	config: AgentConfig,
	iterationIndex: number,
	state: ResponsesLoopState
): Promise<ResponsesNoToolCallsPhaseResult> {
	const handledNoToolCalls = await resolveNoToolCallsHandling(
		config,
		iterationIndex,
		state.lastMessage,
		state.inputMessages
	)
	const nextState = {
		...state,
		lastMessage: handledNoToolCalls.content,
		inputMessages: handledNoToolCalls.input,
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

export async function runResponsesLoop(
	client: ReturnType<typeof createOpenAIClient>,
	model: string,
	maxIterations: number,
	temperature: number | undefined,
	config: AgentConfig
): Promise<AgentResult> {
	const toolDefs = config.tools.map((tool) => tool.definition) satisfies Tool[]
	const conversation = await client.conversations.create({
		items: [
			{ role: 'system', content: config.systemPrompt },
			{ role: 'user', content: config.userPrompt },
		],
	})

	let state: ResponsesLoopState = {
		lastMessage: '',
		flagCaptured: null,
		inputMessages: [],
	}

	for (let iterationIndex = 0; iterationIndex < maxIterations; iterationIndex++) {
		logger.agent('info', `Iteration ${iterationIndex + 1}/${maxIterations}`)

		const response = await client.responses.create(
			createResponsesRequest(model, temperature, config, conversation.id, state.inputMessages, toolDefs)
		)

		state = { ...state, inputMessages: [] }

		for (const item of response.output) {
			if (item.type === 'message') {
				const text = extractResponseMessageText(item.content)
				if (!text) {
					continue
				}

				const messagePhase = await handleResponsesMessage(config, iterationIndex, text, state)
				state = messagePhase.state

				if (messagePhase.exit) {
					return messagePhase.exit
				}
			}

			if (item.type === 'function_call') {
				const toolCallPhase = await handleResponsesToolCall(config, iterationIndex, item, state)
				state = toolCallPhase.state

				if (toolCallPhase.exit) {
					return toolCallPhase.exit
				}
			}
		}

		if (state.inputMessages.length > 0) {
			continue
		}

		const noToolCallsPhase = await handleResponsesNoToolCalls(config, iterationIndex, state)
		state = noToolCallsPhase.state

		if (noToolCallsPhase.exit) {
			return noToolCallsPhase.exit
		}

		if (noToolCallsPhase.shouldContinue) {
			continue
		}

		logger.agent('info', 'No tool calls — agent finished')
		return createLoopExit(state.lastMessage, iterationIndex, state.flagCaptured)
	}

	logger.agent('error', 'Max iterations reached')
	return { finalMessage: state.lastMessage, iterations: maxIterations, flagCaptured: state.flagCaptured }
}
