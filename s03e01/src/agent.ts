import OpenAI from 'openai'
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'
import { config } from './config'
import { logger } from './logger'
import { SYSTEM_PROMPT } from './prompts'
import { toolDefinitions, executeTool } from './tools'

export async function runAgent(): Promise<void> {
	const openai = new OpenAI({
		apiKey: config.openaiApiKey,
		...(config.openaiBaseUrl ? { baseURL: config.openaiBaseUrl } : {}),
	})

	const messages: ChatCompletionMessageParam[] = [
		{ role: 'system', content: SYSTEM_PROMPT },
		{
			role: 'user',
			content: 'Run the sensor anomaly detection evaluation.',
		},
	]

	logger.agent('info', 'Requesting tool call from LLM')
	logger.api('info', 'Sending chat completion request', { messageCount: messages.length })

	const response = await openai.chat.completions.create({
		model: config.openaiModel,
		temperature: config.openaiTemperature,
		messages,
		tools: toolDefinitions,
	})

	const choice = response.choices[0]
	const assistantMessage = choice.message

	if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
		logger.agent('error', 'Agent did not call any tool', { content: assistantMessage.content })
		process.exit(1)
	}

	const toolCall = assistantMessage.tool_calls[0]
	if (toolCall.type !== 'function') {
		logger.agent('error', 'Unexpected tool call type', { type: toolCall.type })
		process.exit(1)
	}

	logger.agent('info', `Agent chose tool: ${toolCall.function.name}`)
	await executeTool(toolCall)
}
