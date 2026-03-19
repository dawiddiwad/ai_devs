import OpenAI from 'openai'
import type { ChatCompletionMessageParam, ChatCompletionTool } from 'openai/resources/chat/completions'
import { config } from '../config'
import { logger } from '../logger'

const MAX_ITERATIONS = 40

type ToolExecutor = (args: unknown) => Promise<string> | string | never

export interface AgentConfig {
	systemPrompt: string
	tools: ChatCompletionTool[]
	toolExecutors: Record<string, ToolExecutor>
}

export async function runAgent(agentConfig: AgentConfig, userMessage: string): Promise<string> {
	const openai = new OpenAI({ apiKey: config.openaiApiKey })

	const messages: ChatCompletionMessageParam[] = [
		{ role: 'system', content: agentConfig.systemPrompt },
		{ role: 'user', content: userMessage },
	]

	for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
		logger.agent('info', `Agent iteration ${iteration + 1}`, { messageCount: messages.length })

		const completion = await openai.chat.completions.create({
			model: config.openaiModel,
			messages,
			tools: agentConfig.tools,
			tool_choice: 'auto',
		})

		const choice = completion.choices[0]
		if (!choice) {
			throw new Error('No completion choice returned')
		}

		const message = choice.message
		messages.push(message)

		if (!message.tool_calls || message.tool_calls.length === 0) {
			logger.agent('info', 'Agent finished with text response', {
				content: message.content?.substring(0, 200),
			})
			return message.content || ''
		}

		for (const toolCall of message.tool_calls) {
			if (toolCall.type !== 'function') continue
			const functionName = toolCall.function.name
			const functionArgs = JSON.parse(toolCall.function.arguments)

			logger.agent('info', 'Agent calling tool', { tool: functionName, args: functionArgs })

			const executor = agentConfig.toolExecutors[functionName]
			if (!executor) {
				const errorMsg = `Unknown tool: ${functionName}`
				logger.agent('error', errorMsg)
				messages.push({
					role: 'tool',
					tool_call_id: toolCall.id,
					content: JSON.stringify({ error: errorMsg }),
				})
				continue
			}

			try {
				const result = await executor(functionArgs)
				logger.tool('info', `Tool ${functionName} completed`, {
					resultLength: typeof result === 'string' ? result.length : 0,
				})
				messages.push({
					role: 'tool',
					tool_call_id: toolCall.id,
					content: typeof result === 'string' ? result : JSON.stringify(result),
				})
			} catch (error) {
				const errorMsg = error instanceof Error ? error.message : String(error)
				logger.tool('error', `Tool ${functionName} failed`, { error: errorMsg })
				messages.push({
					role: 'tool',
					tool_call_id: toolCall.id,
					content: JSON.stringify({ error: errorMsg }),
				})
			}
		}
	}

	logger.agent('warn', 'Agent reached max iterations without completing')
	return 'Max iterations reached without a final response'
}
