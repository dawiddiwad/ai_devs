import OpenAI from 'openai'
import type { ResponseInput, Tool } from 'openai/resources/responses/responses'
import { config } from './config'
import { logger } from './logger'
import { SYSTEM_PROMPT, USER_PROMPT } from './prompts'
import { staticBoundTools } from './types'

const MAX_ITERATIONS = 20

export async function runAgent(): Promise<void> {
	const client = new OpenAI({
		apiKey: config.openaiApiKey,
		baseURL: config.openaiBaseUrl,
	})

	const toolDefinitions = staticBoundTools.map((t) => t.definition) satisfies Tool[]

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
			model: config.orchestratorModel,
			conversation: conversation.id,
			tools: toolDefinitions,
			tool_choice: 'auto',
			temperature: config.openaiTemperature,
			input: inputMessages,
			reasoning: {
				effort: config.openaiReasoningEffort,
			},
			context_management: [{ compact_threshold: 50000, type: 'compaction' }],
		})

		inputMessages = []
		for (const item of response.output) {
			if (item.type === 'message') {
				logger.agent('info', 'Agent message', { content: item.content })
			}
			if (item.type === 'function_call') {
				logger.agent('info', `Tool call: ${item.name}`)
				try {
					const tool = staticBoundTools.find((t) => t.definition.name === item.name)
					const result = tool
						? await tool.execute(JSON.parse(item.arguments))
						: JSON.stringify({ error: `Unknown tool: ${item.name}` })
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
