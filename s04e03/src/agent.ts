import OpenAI from 'openai'
import type { ResponseInput } from 'openai/resources/responses/responses'
import { config } from './config'
import { logger } from './logger'
import { SYSTEM_PROMPT, USER_PROMPT } from './prompts'
import { agentTools, toolDefinitions } from './types'
import { incrementIterations, printSummary } from './stats'

const MAX_ITERATIONS = 40

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
		incrementIterations()
		logger.agent('info', `Iteration ${i + 1}/${MAX_ITERATIONS}`)

		const response = await client.responses.create({
			model: config.openaiModel,
			conversation: conversation.id,
			tools: toolDefinitions,
			tool_choice: 'required',
			temperature: config.openaiTemperature,
			input: inputMessages,
			reasoning: {
				effort: 'high',
			},
			context_management: [{ type: 'compaction', compact_threshold: 100000 }],
		})

		inputMessages = []
		for (const item of response.output) {
			if (item.type === 'message') {
				logger.agent('info', 'Agent message', { content: item.content })
			}
			if (item.type === 'code_interpreter_call') {
				logger.tool('info', 'Code interpreter call', { codeLength: item.code?.length })
			}
			if (item.type === 'function_call') {
				logger.agent('info', `Tool call: ${item.name}`, { args: item.arguments })
				try {
					const tool = agentTools.find((t) => t.definition.name === item.name)
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
	printSummary('MAX ITERATIONS REACHED')
	process.exit(1)
}
