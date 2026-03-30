import OpenAI from 'openai'
import type { ResponseInput } from 'openai/resources/responses/responses'
import { config } from './config'
import { logger } from './logger'
import { SYSTEM_PROMPT, USER_PROMPT } from './prompts'
import { boundTools, toolDefinitions } from './types'

const MAX_ITERATIONS = 30

export async function runAgent(): Promise<void> {
	const client = new OpenAI({
		apiKey: config.openaiApiKey,
		baseURL: config.openaiBaseUrl,
	})

	const conversation = await client.conversations.create({
		items: [
			{ role: 'system', content: SYSTEM_PROMPT },
			{ role: 'user', content: USER_PROMPT },
		],
	})

	let inputMessages: ResponseInput = []
	for (let i = 0; i < MAX_ITERATIONS; i++) {
		logger.agent('info', `Iteration ${i + 1}/${MAX_ITERATIONS}`)
		const response = await client.responses.create({
			model: config.openaiModel,
			conversation: conversation.id,
			tools: toolDefinitions,
			tool_choice: 'required',
			temperature: config.openaiTemperature,
			input: inputMessages,
			reasoning: {
				effort: config.openaiReasoningEffort,
			},
		})

		inputMessages = []
		for (const item of response.output) {
			if (item.type === 'message') {
				logger.agent('info', 'Agent message', { content: item.content })
			}
			if (item.type === 'function_call') {
				logger.agent('info', `Tool call: ${item.name}`)
				try {
					const tool = boundTools.find((t) => t.definition.name === item.name)
					if (!tool) {
						throw new Error(`No tool found with name: ${item.name}`)
					}
					const result = await tool.execute(JSON.parse(item.arguments))
					inputMessages.push({ type: 'function_call_output', call_id: item.call_id, output: result })
				} catch (error) {
					inputMessages.push({
						type: 'function_call_output',
						call_id: item.call_id,
						output: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
					})
				}
			}
		}
	}

	logger.agent('error', 'Max iterations reached without capturing flag')
	process.exit(1)
}
