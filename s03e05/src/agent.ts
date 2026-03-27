import OpenAI from 'openai'
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'
import { config } from './config'
import { logger } from './logger'
import { SYSTEM_PROMPT } from './prompts'
import { searchToolDefinition, toolSearch } from './tools/tool-search'
import { useToolDefinition, useTool } from './tools/use-tool'
import { submitRouteDefinition, submitRoute } from './tools/submit-route'
import { executeJsDefinition, executeJs } from './tools/execute-js'

const MAX_ITERATIONS = 30

const toolExecutors: Record<string, (args: unknown) => Promise<string>> = {
	tool_search: toolSearch,
	use_tool: useTool,
	submit_route: submitRoute,
	execute_js: executeJs,
}

const toolDefinitions = [searchToolDefinition, useToolDefinition, executeJsDefinition, submitRouteDefinition]

export async function runAgent(): Promise<void> {
	const client = new OpenAI({
		apiKey: config.openaiApiKey,
		baseURL: config.openaiBaseUrl,
	})

	const messages: ChatCompletionMessageParam[] = [
		{ role: 'system', content: SYSTEM_PROMPT },
		{
			role: 'user',
			content:
				'Plan and submit the optimal route for the messenger to reach city Skolwin. Start by discovering available tools.',
		},
	]

	for (let i = 0; i < MAX_ITERATIONS; i++) {
		logger.agent('info', `Iteration ${i + 1}/${MAX_ITERATIONS}`)

		const response = await client.chat.completions.create({
			model: config.openaiModel,
			messages,
			tools: toolDefinitions,
			tool_choice: 'required',
			temperature: config.openaiTemperature,
		})

		const message = response.choices[0].message
		messages.push(message)

		if (!message.tool_calls?.length) {
			logger.agent('info', 'Agent stopped without tool calls', { content: message.content })
			break
		}

		for (const toolCall of message.tool_calls) {
			if (toolCall.type !== 'function') continue

			const { name, arguments: rawArgs } = toolCall.function
			logger.agent('info', `Tool call: ${name}`)

			let result: string
			try {
				const executor = toolExecutors[name]
				if (!executor) {
					result = JSON.stringify({ error: `Unknown tool: ${name}` })
				} else {
					result = await executor(JSON.parse(rawArgs))
				}
			} catch (error) {
				result = JSON.stringify({ error: error instanceof Error ? error.message : String(error) })
			}

			logger.tool('debug', `Tool result: ${name}`, { result: result.slice(0, 200) })
			messages.push({ role: 'tool', tool_call_id: toolCall.id, content: result })
		}
	}
	logger.agent('error', `Max agent iterations reached without capturing flag`)
	process.exit(1)
}
