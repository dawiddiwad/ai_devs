import type { ResponseInput, ResponseOutputAudio, Tool } from 'openai/resources/responses/responses'
import { logger } from './logger.js'
import { safelyObserve } from './observability.js'
import { withOpenAIRetry } from './openai-retry.js'
import { getToolResultText, serializeToolResultForResponses } from './tool-result.js'
import { captureFlag } from './verify.js'
import { createOpenAIClient } from './openai-client.js'
import type {
	AgentObservationHandle,
	AgentOutput,
	AgentOutputHandlerResult,
	AgentNoToolCallsHandlerResult,
	AgentResult,
	AgentResponsesConfig,
	AgentToolResult,
	AgentToolCallHandlerResult,
} from './types.js'

type LoopExit = AgentResult | null

type ResponsesFunctionCallItem = {
	call_id: string
	name: string
	arguments: string
}

type ResponsesLoopState = {
	lastOutput: AgentOutput
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
	result: AgentOutputHandlerResult | AgentToolCallHandlerResult | AgentNoToolCallsHandlerResult
): result is
	| (Extract<AgentOutputHandlerResult, { input?: ResponseInput }> & { input: ResponseInput })
	| (Extract<AgentToolCallHandlerResult, { input?: ResponseInput }> & { input: ResponseInput })
	| (Extract<AgentNoToolCallsHandlerResult, { input?: ResponseInput }> & { input: ResponseInput }) {
	return !!result && typeof result === 'object' && 'input' in result && result.input !== undefined
}

function createEmptyOutput(): AgentOutput {
	return { text: '' }
}

function createLoopExit(output: AgentOutput, iterationIndex: number, flagCaptured: string | null): AgentResult {
	return { output, iterations: iterationIndex + 1, flagCaptured }
}

function resolveFinalState(
	config: AgentResponsesConfig,
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

function createResponsesRequest(
	model: string,
	temperature: number | undefined,
	config: AgentResponsesConfig,
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

function normalizeResponsesAudioOutput(audio: ResponseOutputAudio, config: AgentResponsesConfig): AgentOutput['audio'] {
	const configuredFormat = config.output?.audio?.format
	const format = configuredFormat === 'pcm' ? 'pcm16' : (configuredFormat ?? 'mp3')

	return {
		base64: audio.data,
		format,
		transcript: audio.transcript,
	}
}

function mergeOutputs(current: AgentOutput | null, next: AgentOutput): AgentOutput {
	return {
		text: next.text || current?.text || '',
		...(current?.audio || next.audio ? { audio: next.audio ?? current?.audio } : {}),
	}
}

function appendResponsesToolOutput(input: ResponseInput, callId: string, output: AgentToolResult): ResponseInput {
	const serialized = serializeToolResultForResponses(output)

	return [
		...input,
		{ type: 'function_call_output', call_id: callId, output: serialized.output },
		...serialized.followUpInput,
	]
}

function appendResponsesToolError(input: ResponseInput, callId: string, error: unknown): ResponseInput {
	const errorMessage = error instanceof Error ? error.message : String(error)

	logger.tool('error', 'Tool error', { callId, error: errorMessage })

	return appendResponsesToolOutput(input, callId, JSON.stringify({ error: errorMessage }))
}

function createDefaultToolExecutor(
	config: AgentResponsesConfig,
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
	config: AgentResponsesConfig,
	iterationIndex: number,
	output: AgentOutput,
	input: ResponseInput
): Promise<{ output: AgentOutput; input: ResponseInput; isFinal: boolean }> {
	const handled = await config.handleOutput?.({ api: 'responses', iterationIndex, output, input })

	if (!handled) {
		return { output, input, isFinal: false }
	}

	return {
		output: handled.output ?? output,
		input: hasInputAccumulator(handled) ? handled.input : input,
		isFinal: handled.action === 'final',
	}
}

async function resolveToolCallHandling(
	config: AgentResponsesConfig,
	iterationIndex: number,
	name: string,
	args: unknown,
	input: ResponseInput,
	executeDefault: () => Promise<AgentToolResult>
): Promise<{ result: AgentToolResult; input: ResponseInput; inputWasReplaced: boolean; isFinal: boolean }> {
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
	config: AgentResponsesConfig,
	iterationIndex: number,
	output: AgentOutput,
	input: ResponseInput
): Promise<{ output: AgentOutput; input: ResponseInput; shouldContinue: boolean; isFinal: boolean }> {
	const handled = await config.handleNoToolCalls?.({ api: 'responses', iterationIndex, output, input })

	if (!handled) {
		return { output, input, shouldContinue: false, isFinal: false }
	}

	if (handled.action === 'final') {
		return {
			output: handled.output ?? output,
			input: hasInputAccumulator(handled) ? handled.input : input,
			shouldContinue: false,
			isFinal: true,
		}
	}

	if (!hasInputAccumulator(handled)) {
		throw new Error('handleNoToolCalls must return input when action is continue for the responses API')
	}

	return {
		output: handled.output ?? output,
		input: handled.input,
		shouldContinue: true,
		isFinal: false,
	}
}

async function handleResponsesOutput(
	config: AgentResponsesConfig,
	iterationIndex: number,
	output: AgentOutput,
	state: ResponsesLoopState,
	runHandle: AgentObservationHandle | undefined
): Promise<ResponsesMessagePhaseResult> {
	const handledOutput = await resolveOutputHandling(config, iterationIndex, output, state.inputMessages)
	const nextState = {
		...state,
		lastOutput: handledOutput.output,
		inputMessages: handledOutput.input,
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
				api: 'responses',
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

async function handleResponsesToolCall(
	config: AgentResponsesConfig,
	iterationIndex: number,
	item: ResponsesFunctionCallItem,
	state: ResponsesLoopState,
	runHandle: AgentObservationHandle | undefined
): Promise<ResponsesToolCallPhaseResult> {
	logger.tool('info', `Tool call: ${item.name}`, { args: item.arguments.slice(0, 200) })
	const toolHandle = await safelyObserve(
		'onToolStart',
		() =>
			config.observability?.onToolStart?.({
				api: 'responses',
				runHandle,
				iterationIndex,
				name: item.name,
				args: item.arguments,
			}),
		undefined
	)

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
		await safelyObserve(
			'onToolEnd',
			() =>
				config.observability?.onToolEnd?.({
					api: 'responses',
					runHandle,
					toolHandle,
					iterationIndex,
					name: item.name,
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
			exit,
		}
	} catch (error) {
		await safelyObserve(
			'onToolError',
			() =>
				config.observability?.onToolError?.({
					api: 'responses',
					runHandle,
					toolHandle,
					iterationIndex,
					name: item.name,
					args: item.arguments,
					errorMessage: error instanceof Error ? error.message : String(error),
				}),
			undefined
		)

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
	config: AgentResponsesConfig,
	iterationIndex: number,
	state: ResponsesLoopState
): Promise<ResponsesNoToolCallsPhaseResult> {
	const handledNoToolCalls = await resolveNoToolCallsHandling(
		config,
		iterationIndex,
		state.lastOutput,
		state.inputMessages
	)
	const nextState = {
		...state,
		lastOutput: handledNoToolCalls.output,
		inputMessages: handledNoToolCalls.input,
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

export async function runResponsesLoop(
	client: ReturnType<typeof createOpenAIClient>,
	model: string,
	maxIterations: number,
	temperature: number | undefined,
	config: AgentResponsesConfig,
	runHandle?: AgentObservationHandle
): Promise<AgentResult> {
	if (config.output?.audio || config.output?.modalities?.includes('audio')) {
		throw new Error(
			'Direct model audio output is not supported by the Responses loop yet. Use api: "completions" for native audio generation.'
		)
	}

	const toolDefs = config.tools.map((tool) => tool.definition) satisfies Tool[]
	const conversation = await withOpenAIRetry('conversations.create', () =>
		client.conversations.create({
			items: [
				{ role: 'system', content: config.systemPrompt },
				{ role: 'user', content: config.userPrompt },
			],
		})
	)

	let state: ResponsesLoopState = {
		lastOutput: createEmptyOutput(),
		flagCaptured: null,
		inputMessages: [],
	}

	for (let iterationIndex = 0; iterationIndex < maxIterations; iterationIndex++) {
		logger.agent('info', `Iteration ${iterationIndex + 1}/${maxIterations}`)

		const request = createResponsesRequest(
			model,
			temperature,
			config,
			conversation.id,
			state.inputMessages,
			toolDefs
		)
		const modelHandle = await safelyObserve(
			'onModelStart',
			() =>
				config.observability?.onModelStart?.({
					api: 'responses',
					runHandle,
					model,
					iterationIndex,
					request,
				}),
			undefined
		)

		let response: Awaited<ReturnType<typeof client.responses.create>>
		try {
			response = await withOpenAIRetry('responses.create', () => client.responses.create(request))
			await safelyObserve(
				'onModelEnd',
				() =>
					config.observability?.onModelEnd?.({
						api: 'responses',
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
						api: 'responses',
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

		state = { ...state, inputMessages: [] }
		let pendingOutput: AgentOutput | null = null
		let producedOutputThisIteration = false

		const flushPendingOutput = async (): Promise<LoopExit> => {
			if (!pendingOutput) {
				return null
			}

			const outputPhase = await handleResponsesOutput(config, iterationIndex, pendingOutput, state, runHandle)
			state = outputPhase.state
			producedOutputThisIteration = true
			pendingOutput = null

			return outputPhase.exit
		}

		for (const item of response.output as Array<(typeof response.output)[number] | ResponseOutputAudio>) {
			if (item.type === 'message') {
				const text = extractResponseMessageText(item.content)
				if (text) {
					pendingOutput = mergeOutputs(pendingOutput, { text })
				}

				continue
			}

			if (item.type === 'output_audio') {
				pendingOutput = mergeOutputs(pendingOutput, {
					text: item.transcript,
					audio: normalizeResponsesAudioOutput(item, config),
				})

				continue
			}

			const outputExit = await flushPendingOutput()
			if (outputExit) {
				return outputExit
			}

			if (item.type === 'function_call') {
				const toolCallPhase = await handleResponsesToolCall(config, iterationIndex, item, state, runHandle)
				state = toolCallPhase.state

				if (toolCallPhase.exit) {
					return toolCallPhase.exit
				}
			}
		}

		const outputExit = await flushPendingOutput()
		if (outputExit) {
			return outputExit
		}

		if (state.inputMessages.length > 0) {
			continue
		}

		if (!producedOutputThisIteration) {
			state = { ...state, lastOutput: createEmptyOutput() }
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
		return createLoopExit(state.lastOutput, iterationIndex, state.flagCaptured)
	}

	logger.agent('error', 'Max iterations reached')
	return { output: state.lastOutput, iterations: maxIterations, flagCaptured: state.flagCaptured }
}
