import OpenAI from 'openai'
import { config } from './config'
import { logger } from './logger'
import { SYSTEM_PROMPT, USER_PROMPT } from './prompts'
import { ResponseInput } from 'openai/resources/responses/responses'
import { toolDefinitions, toolExecutors } from './types'

const MAX_ITERATIONS = 30

export async function runAgent(): Promise<void> {
	const client = new OpenAI({
		apiKey: config.openaiApiKey,
		baseURL: config.openaiBaseUrl,
	})

	const coversation = await client.conversations.create({
		items: [
			{ role: 'system', content: SYSTEM_PROMPT },
			{ role: 'user', content: USER_PROMPT },
		],
	})

	let inputMessages: ResponseInput = []
	for (let i = 0; i < MAX_ITERATIONS; i++) {
		logger.agent('info', `Iteration ${i + 1}/${MAX_ITERATIONS}`)
		inputMessages = []
		const response = await client.responses.create({
			model: config.openaiModel,
			conversation: coversation.id,
			tools: toolDefinitions,
			tool_choice: 'required',
			temperature: config.openaiTemperature,
			input: inputMessages,
			reasoning: {
				effort: config.openaiReasoningEffort,
			},
			context_management: [{ compact_threshold: 100000, type: 'compaction' }],
		})

		for (const item of response.output) {
			if (item.type === 'message') {
				logger.agent('info', 'Agent responded with text', { content: item.content })
			}
			if (item.type === 'function_call') {
				logger.agent('info', `Tool call: ${item.name}`)
				try {
					const executor = toolExecutors[item.name]
					if (!executor) {
						const result = JSON.stringify({ error: `Unknown tool: ${item.name}` })
						inputMessages.push({ type: 'function_call_output', call_id: item.call_id, output: result })
					} else {
						const result = await executor(JSON.parse(item.arguments))
						inputMessages.push({ type: 'function_call_output', call_id: item.call_id, output: result })
					}
				} catch (error) {
					const result = JSON.stringify({ error: error instanceof Error ? error.message : String(error) })
					inputMessages.push({ type: 'function_call_output', call_id: item.call_id, output: result })
				}
			}
			if (item.type === 'code_interpreter_call') {
				logger.tool('info', 'Agent calls code interpreter', { codeLength: item.code?.length })
			}
		}
	}
	logger.agent('error', `Max agent iterations reached without capturing flag`)
	process.exit(1)
}
