import type { ResponseInput, Tool } from 'openai/resources/responses/responses'
import type { ChatCompletionMessageParam, ChatCompletionTool } from 'openai/resources/chat/completions'
import { logger } from './logger.js'
import { captureFlag } from './verify.js'
import { createOpenAIClient } from './openai-client.js'
import type { AgentApi, AgentConfig, AgentResult, CoreConfig } from './types.js'

export async function runAgent(coreConfig: CoreConfig, agentConfig: AgentConfig): Promise<AgentResult> {
	const client = createOpenAIClient(coreConfig)
	const model = agentConfig.model ?? coreConfig.openaiModel
	const maxIterations = agentConfig.maxIterations ?? 20
	const temperature = agentConfig.temperature ?? coreConfig.openaiTemperature

	logger.agent('info', 'Starting agent', {
		api: agentConfig.api,
		model,
		maxIterations,
		toolCount: agentConfig.tools.length,
	})

	if (agentConfig.api === 'responses') {
		return runResponsesAgent(client, model, maxIterations, temperature, agentConfig)
	}
	return runCompletionsAgent(client, model, maxIterations, temperature, agentConfig)
}

async function resolveMessageHandling(
	config: AgentConfig,
	api: AgentApi,
	iterationIndex: number,
	content: string
): Promise<{ content: string; isFinal: boolean }> {
	const handled = await config.handleMessage?.({ api, iterationIndex, content })

	if (!handled) {
		return { content, isFinal: false }
	}

	if (handled.action === 'final') {
		return { content: handled.content ?? content, isFinal: true }
	}

	return { content: handled.content ?? content, isFinal: false }
}

async function resolveToolCallHandling(
	config: AgentConfig,
	api: AgentApi,
	iterationIndex: number,
	name: string,
	args: unknown,
	executeDefault: () => Promise<string>
): Promise<{ result: string; isFinal: boolean }> {
	const handled = await config.handleToolCall?.({ api, iterationIndex, name, args, executeDefault })

	if (!handled) {
		return { result: await executeDefault(), isFinal: false }
	}

	if (handled.action === 'final') {
		return { result: handled.result, isFinal: true }
	}

	if (handled.result !== undefined) {
		return { result: handled.result, isFinal: false }
	}

	return { result: await executeDefault(), isFinal: false }
}

async function runResponsesAgent(
	client: ReturnType<typeof createOpenAIClient>,
	model: string,
	maxIterations: number,
	temperature: number | undefined,
	config: AgentConfig
): Promise<AgentResult> {
	const toolDefs = config.tools.map((t) => t.definition) satisfies Tool[]

	const conversation = await client.conversations.create({
		items: [
			{ role: 'system', content: config.systemPrompt },
			{ role: 'user', content: config.userPrompt },
		],
	})

	let lastMessage = ''
	let flagCaptured: string | null = null
	let inputMessages: ResponseInput = []

	for (let iteration = 0; iteration < maxIterations; iteration++) {
		logger.agent('info', `Iteration ${iteration + 1}/${maxIterations}`)

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
					.filter((c) => c.type === 'output_text')
					.map((c) => ('text' in c ? c.text : ''))
					.join('')

				if (text) {
					const handledMessage = await resolveMessageHandling(config, 'responses', iteration, text)
					lastMessage = handledMessage.content
					logger.agent('info', 'Agent message', { content: handledMessage.content.slice(0, 200) })
					await config.onMessage?.(handledMessage.content)

					const flag = captureFlag(handledMessage.content)
					if (flag) {
						flagCaptured = flag
						if (config.exitOnFlag !== false) process.exit(0)
						return { finalMessage: lastMessage, iterations: iteration + 1, flagCaptured }
					}

					if (handledMessage.isFinal) {
						return { finalMessage: lastMessage, iterations: iteration + 1, flagCaptured }
					}
				}
			}

			if (item.type === 'function_call') {
				logger.tool('info', `Tool call: ${item.name}`, { args: item.arguments.slice(0, 200) })

				try {
					const tool = config.tools.find((t) => t.definition.name === item.name)
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
						'responses',
						iteration,
						item.name,
						parsedArgs,
						executeDefault
					)
					const result = handledToolCall.result

					await config.onToolCall?.(item.name, parsedArgs, result)

					const flag = captureFlag(result)
					if (flag) {
						flagCaptured = flag
						if (config.exitOnFlag !== false) process.exit(0)
						return { finalMessage: result, iterations: iteration + 1, flagCaptured }
					}

					if (handledToolCall.isFinal) {
						return { finalMessage: result, iterations: iteration + 1, flagCaptured }
					}

					inputMessages.push({
						type: 'function_call_output',
						call_id: item.call_id,
						output: result,
					})
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
			logger.agent('info', 'No tool calls — agent finished')
			return { finalMessage: lastMessage, iterations: iteration + 1, flagCaptured }
		}
	}

	logger.agent('error', 'Max iterations reached')
	return { finalMessage: lastMessage, iterations: maxIterations, flagCaptured }
}

async function runCompletionsAgent(
	client: ReturnType<typeof createOpenAIClient>,
	model: string,
	maxIterations: number,
	temperature: number | undefined,
	config: AgentConfig
): Promise<AgentResult> {
	const toolDefs: ChatCompletionTool[] = config.tools.map((t) => ({
		type: 'function' as const,
		function: {
			name: t.definition.name,
			description: t.definition.description ?? '',
			parameters: t.definition.parameters as Record<string, unknown>,
			strict: t.definition.strict,
		},
	}))

	const messages: ChatCompletionMessageParam[] = [
		{ role: 'system', content: config.systemPrompt },
		{ role: 'user', content: config.userPrompt },
	]

	let lastMessage = ''
	let flagCaptured: string | null = null

	for (let iteration = 0; iteration < maxIterations; iteration++) {
		logger.agent('info', `Iteration ${iteration + 1}/${maxIterations}`)

		const response = await client.chat.completions.create({
			model,
			messages,
			tools: toolDefs.length > 0 ? toolDefs : undefined,
			temperature,
		})

		const message = response.choices[0]?.message
		if (!message) {
			logger.agent('error', 'No message in response')
			return { finalMessage: lastMessage, iterations: iteration + 1, flagCaptured }
		}

		messages.push(message)

		if (message.content) {
			const handledMessage = await resolveMessageHandling(config, 'completions', iteration, message.content)
			lastMessage = handledMessage.content
			logger.agent('info', 'Agent message', { content: handledMessage.content.slice(0, 200) })
			await config.onMessage?.(handledMessage.content)

			const flag = captureFlag(handledMessage.content)
			if (flag) {
				flagCaptured = flag
				if (config.exitOnFlag !== false) process.exit(0)
				return { finalMessage: lastMessage, iterations: iteration + 1, flagCaptured }
			}

			if (handledMessage.isFinal) {
				return { finalMessage: lastMessage, iterations: iteration + 1, flagCaptured }
			}
		}

		if (!message.tool_calls?.length) {
			logger.agent('info', 'No tool calls — agent finished')
			logger.agent('info', 'Response', { content: JSON.stringify(response, null, 2) })
			return { finalMessage: lastMessage, iterations: iteration + 1, flagCaptured }
		}

		for (const toolCall of message.tool_calls) {
			if (toolCall.type !== 'function') continue

			logger.tool('info', `Tool call: ${toolCall.function.name}`, {
				args: toolCall.function.arguments.slice(0, 200),
			})

			try {
				const tool = config.tools.find((t) => t.definition.name === toolCall.function.name)
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
					'completions',
					iteration,
					toolCall.function.name,
					parsedArgs,
					executeDefault
				)
				const result = handledToolCall.result

				await config.onToolCall?.(toolCall.function.name, parsedArgs, result)

				const flag = captureFlag(result)
				if (flag) {
					flagCaptured = flag
					if (config.exitOnFlag !== false) process.exit(0)
					return { finalMessage: result, iterations: iteration + 1, flagCaptured }
				}

				if (handledToolCall.isFinal) {
					return { finalMessage: result, iterations: iteration + 1, flagCaptured }
				}

				messages.push({
					role: 'tool',
					tool_call_id: toolCall.id,
					content: result,
				})
			} catch (error) {
				const errorMsg = error instanceof Error ? error.message : String(error)
				logger.tool('error', `Tool error: ${toolCall.function.name}`, { error: errorMsg })
				messages.push({
					role: 'tool',
					tool_call_id: toolCall.id,
					content: JSON.stringify({ error: errorMsg }),
				})
			}
		}
	}

	logger.agent('error', 'Max iterations reached')
	return { finalMessage: lastMessage, iterations: maxIterations, flagCaptured }
}
