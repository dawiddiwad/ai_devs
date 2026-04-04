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

function hasInputAccumulator(
	result: AgentMessageHandlerResult | AgentToolCallHandlerResult | AgentNoToolCallsHandlerResult
): result is
	| (Extract<AgentMessageHandlerResult, { input?: ResponseInput }> & { input: ResponseInput })
	| (Extract<AgentToolCallHandlerResult, { input?: ResponseInput }> & { input: ResponseInput })
	| (Extract<AgentNoToolCallsHandlerResult, { input?: ResponseInput }> & { input: ResponseInput }) {
	return !!result && typeof result === 'object' && 'input' in result && result.input !== undefined
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

	const result = handled.action === 'final' ? handled.result : (handled.result ?? (await executeDefault()))

	return {
		result,
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

	const nextContent = handled.content ?? content

	if (handled.action === 'final') {
		return {
			content: nextContent,
			input: hasInputAccumulator(handled) ? handled.input : input,
			shouldContinue: false,
			isFinal: true,
		}
	}

	if (!hasInputAccumulator(handled)) {
		throw new Error('handleNoToolCalls must return input when action is continue for the responses API')
	}

	return {
		content: nextContent,
		input: handled.input,
		shouldContinue: true,
		isFinal: false,
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

	let lastMessage = ''
	let flagCaptured: string | null = null
	let inputMessages: ResponseInput = []

	for (let iterationIndex = 0; iterationIndex < maxIterations; iterationIndex++) {
		logger.agent('info', `Iteration ${iterationIndex + 1}/${maxIterations}`)

		const response = await client.responses.create({
			model,
			conversation: conversation.id,
			tools: toolDefs,
			tool_choice: config.toolChoice ?? 'auto',
			temperature,
			input: inputMessages,
			...(config.reasoning ? { reasoning: config.reasoning } : {}),
			context_management: [{ type: 'compaction', compact_threshold: config.compactThreshold ?? 100000 }],
			service_tier: config.serviceTier,
		})

		inputMessages = []

		for (const item of response.output) {
			if (item.type === 'message') {
				const text = item.content
					.filter((contentItem) => contentItem.type === 'output_text')
					.map((contentItem) => ('text' in contentItem ? contentItem.text : ''))
					.join('')

				if (text) {
					const handledMessage = await resolveMessageHandling(config, iterationIndex, text, inputMessages)
					inputMessages = handledMessage.input
					lastMessage = handledMessage.content
					logger.agent('info', 'Agent message', { content: handledMessage.content.slice(0, 200) })
					await config.onMessage?.(handledMessage.content)

					const flag = captureFlag(handledMessage.content)
					if (flag) {
						flagCaptured = flag
						if (config.exitOnFlag !== false) process.exit(0)
						return { finalMessage: lastMessage, iterations: iterationIndex + 1, flagCaptured }
					}

					if (handledMessage.isFinal) {
						return { finalMessage: lastMessage, iterations: iterationIndex + 1, flagCaptured }
					}
				}
			}

			if (item.type === 'function_call') {
				logger.tool('info', `Tool call: ${item.name}`, { args: item.arguments.slice(0, 200) })

				try {
					const tool = config.tools.find((candidate) => candidate.definition.name === item.name)
					const parsedArgs = JSON.parse(item.arguments)
					let defaultResultPromise: Promise<string> | undefined
					const executeDefault = () => {
						if (!defaultResultPromise) {
							defaultResultPromise = tool
								? tool.execute(parsedArgs)
								: Promise.resolve(JSON.stringify({ error: `Unknown tool: ${item.name}` }))
						}

						return defaultResultPromise
					}

					const handledToolCall = await resolveToolCallHandling(
						config,
						iterationIndex,
						item.name,
						parsedArgs,
						inputMessages,
						executeDefault
					)
					inputMessages = handledToolCall.input

					await config.onToolCall?.(item.name, parsedArgs, handledToolCall.result)

					const flag = captureFlag(handledToolCall.result)
					if (flag) {
						flagCaptured = flag
						if (config.exitOnFlag !== false) process.exit(0)
						return { finalMessage: handledToolCall.result, iterations: iterationIndex + 1, flagCaptured }
					}

					if (handledToolCall.isFinal) {
						return { finalMessage: handledToolCall.result, iterations: iterationIndex + 1, flagCaptured }
					}

					if (!handledToolCall.inputWasReplaced) {
						inputMessages.push({
							type: 'function_call_output',
							call_id: item.call_id,
							output: handledToolCall.result,
						})
					}
				} catch (error) {
					const errorMsg = error instanceof Error ? error.message : String(error)
					logger.tool('error', `Tool error: ${item.name}`, { error: errorMsg })
					inputMessages.push({
						type: 'function_call_output',
						call_id: item.call_id,
						output: JSON.stringify({ error: errorMsg }),
					})
				}
			}
		}

		if (inputMessages.length === 0) {
			const handledNoToolCalls = await resolveNoToolCallsHandling(
				config,
				iterationIndex,
				lastMessage,
				inputMessages
			)
			lastMessage = handledNoToolCalls.content

			const flag = captureFlag(lastMessage)
			if (flag) {
				flagCaptured = flag
				if (config.exitOnFlag !== false) process.exit(0)
				return { finalMessage: lastMessage, iterations: iterationIndex + 1, flagCaptured }
			}

			if (handledNoToolCalls.shouldContinue) {
				inputMessages = handledNoToolCalls.input
				continue
			}

			logger.agent('info', 'No tool calls — agent finished')
			return { finalMessage: lastMessage, iterations: iterationIndex + 1, flagCaptured }
		}
	}

	logger.agent('error', 'Max iterations reached')
	return { finalMessage: lastMessage, iterations: maxIterations, flagCaptured }
}
