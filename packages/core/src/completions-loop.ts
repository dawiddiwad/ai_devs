import type { ChatCompletionMessageParam, ChatCompletionTool } from 'openai/resources/chat/completions'
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

async function resolveMessageHandling(
	config: AgentConfig,
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
	config: AgentConfig,
	iterationIndex: number,
	name: string,
	args: unknown,
	messages: ChatCompletionMessageParam[],
	executeDefault: () => Promise<string>
): Promise<{
	result: string
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

	const result = handled.action === 'final' ? handled.result : (handled.result ?? (await executeDefault()))

	return {
		result,
		messages: messagesWereReplaced ? handled.messages : messages,
		messagesWereReplaced,
		isFinal: handled.action === 'final',
	}
}

async function resolveNoToolCallsHandling(
	config: AgentConfig,
	iterationIndex: number,
	content: string,
	messages: ChatCompletionMessageParam[]
): Promise<{ content: string; messages: ChatCompletionMessageParam[]; shouldContinue: boolean; isFinal: boolean }> {
	const handled = await config.handleNoToolCalls?.({ api: 'completions', iterationIndex, content, messages })

	if (!handled) {
		return { content, messages, shouldContinue: false, isFinal: false }
	}

	const nextContent = handled.content ?? content

	if (handled.action === 'final') {
		return {
			content: nextContent,
			messages: hasMessagesAccumulator(handled) ? handled.messages : messages,
			shouldContinue: false,
			isFinal: true,
		}
	}

	if (!hasMessagesAccumulator(handled)) {
		throw new Error('handleNoToolCalls must return messages when action is continue for the completions API')
	}

	return {
		content: nextContent,
		messages: handled.messages,
		shouldContinue: true,
		isFinal: false,
	}
}

export async function runCompletionsLoop(
	client: ReturnType<typeof createOpenAIClient>,
	model: string,
	maxIterations: number,
	temperature: number | undefined,
	config: AgentConfig
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

	let messages: ChatCompletionMessageParam[] = [
		{ role: 'system', content: config.systemPrompt },
		{ role: 'user', content: config.userPrompt },
	]

	let lastMessage = ''
	let flagCaptured: string | null = null

	for (let iterationIndex = 0; iterationIndex < maxIterations; iterationIndex++) {
		logger.agent('info', `Iteration ${iterationIndex + 1}/${maxIterations}`)

		const response = await client.chat.completions.create({
			model,
			messages,
			tools: toolDefs.length > 0 ? toolDefs : undefined,
			temperature,
		})

		const message = response.choices[0]?.message
		if (!message) {
			logger.agent('error', 'No message in response')
			return { finalMessage: lastMessage, iterations: iterationIndex + 1, flagCaptured }
		}

		messages = [...messages, message]

		if (message.content) {
			const handledMessage = await resolveMessageHandling(config, iterationIndex, message.content, messages)
			messages = handledMessage.messages
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

		if (!message.tool_calls?.length) {
			const handledNoToolCalls = await resolveNoToolCallsHandling(config, iterationIndex, lastMessage, messages)
			messages = handledNoToolCalls.messages
			lastMessage = handledNoToolCalls.content

			const flag = captureFlag(lastMessage)
			if (flag) {
				flagCaptured = flag
				if (config.exitOnFlag !== false) process.exit(0)
				return { finalMessage: lastMessage, iterations: iterationIndex + 1, flagCaptured }
			}

			if (handledNoToolCalls.shouldContinue) {
				continue
			}

			logger.agent('info', 'No tool calls — agent finished')
			logger.agent('info', 'Response', { content: JSON.stringify(response, null, 2) })
			return { finalMessage: lastMessage, iterations: iterationIndex + 1, flagCaptured }
		}

		for (const toolCall of message.tool_calls) {
			if (toolCall.type !== 'function') {
				continue
			}

			logger.tool('info', `Tool call: ${toolCall.function.name}`, {
				args: toolCall.function.arguments.slice(0, 200),
			})

			try {
				const tool = config.tools.find((candidate) => candidate.definition.name === toolCall.function.name)
				const parsedArgs = JSON.parse(toolCall.function.arguments)
				let defaultResultPromise: Promise<string> | undefined
				const executeDefault = () => {
					if (!defaultResultPromise) {
						defaultResultPromise = tool
							? tool.execute(parsedArgs)
							: Promise.resolve(JSON.stringify({ error: `Unknown tool: ${toolCall.function.name}` }))
					}

					return defaultResultPromise
				}

				const handledToolCall = await resolveToolCallHandling(
					config,
					iterationIndex,
					toolCall.function.name,
					parsedArgs,
					messages,
					executeDefault
				)
				messages = handledToolCall.messages

				await config.onToolCall?.(toolCall.function.name, parsedArgs, handledToolCall.result)

				const flag = captureFlag(handledToolCall.result)
				if (flag) {
					flagCaptured = flag
					if (config.exitOnFlag !== false) process.exit(0)
					return { finalMessage: handledToolCall.result, iterations: iterationIndex + 1, flagCaptured }
				}

				if (handledToolCall.isFinal) {
					return { finalMessage: handledToolCall.result, iterations: iterationIndex + 1, flagCaptured }
				}

				if (!handledToolCall.messagesWereReplaced) {
					messages = [
						...messages,
						{
							role: 'tool',
							tool_call_id: toolCall.id,
							content: handledToolCall.result,
						},
					]
				}
			} catch (error) {
				const errorMsg = error instanceof Error ? error.message : String(error)
				logger.tool('error', `Tool error: ${toolCall.function.name}`, { error: errorMsg })
				messages = [
					...messages,
					{
						role: 'tool',
						tool_call_id: toolCall.id,
						content: JSON.stringify({ error: errorMsg }),
					},
				]
			}
		}
	}

	logger.agent('error', 'Max iterations reached')
	return { finalMessage: lastMessage, iterations: maxIterations, flagCaptured }
}
