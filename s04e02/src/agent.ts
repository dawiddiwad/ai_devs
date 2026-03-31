import OpenAI from 'openai'
import type { ResponseInput, ResponseInputItem } from 'openai/resources/responses/responses'
import { config } from './config'
import { logger } from './logger'
import { SYSTEM_PROMPT, USER_PROMPT } from './prompts'
import { agentTools } from './types'

const MAX_ITERATIONS = 10

export async function runAgent(helpDocs: unknown): Promise<void> {
	const client = new OpenAI({ apiKey: config.openaiApiKey })

	const toolDefinitions = agentTools.map((t) => t.definition)

	const conversation = await client.conversations.create({
		items: [
			{ role: 'system', content: SYSTEM_PROMPT(helpDocs) },
			{ role: 'user', content: USER_PROMPT },
		],
	})

	let inputMessages: ResponseInput = []

	for (let i = 0; i < MAX_ITERATIONS; i++) {
		logger.agent('info', `Agent iteration ${i + 1}/${MAX_ITERATIONS}`)

		const response = await client.responses.create({
			model: config.openaiModel,
			conversation: conversation.id,
			tools: toolDefinitions,
			tool_choice: 'required',
			parallel_tool_calls: true,
			temperature: config.openaiTemperature,
			reasoning: {
				effort: 'low',
			},
			input: inputMessages,
		})

		inputMessages = []

		const functionCalls = response.output.filter((item) => item.type === 'function_call')

		const outputs = await Promise.all(
			functionCalls.map(async (item) => {
				const tool = agentTools.find((t) => t.definition.name === item.name)
				const result = tool
					? await tool.execute(JSON.parse(item.arguments))
					: JSON.stringify({ error: `Unknown tool: ${item.name}` })
				logger.tool('info', `${item.name} completed`)
				return {
					type: 'function_call_output',
					call_id: item.call_id,
					output: result,
				} satisfies ResponseInputItem
			})
		)

		inputMessages.push(...outputs)
	}

	logger.agent('error', 'Max iterations reached without capturing flag')
	process.exit(1)
}
