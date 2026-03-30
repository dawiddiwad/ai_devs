import OpenAI from 'openai'
import type { ResponseInput, Tool } from 'openai/resources/responses/responses'
import { config } from './config'
import { logger } from './logger'
import { SUBAGENT_SYSTEM_PROMPT } from './prompts'
import { initBrowserTools } from './tools/browser'
import { defineTool } from './tool-factory'
import { z } from 'zod/v4'

const MAX_SUBAGENT_ITERATIONS = 15

export async function runSubagent(task: string): Promise<string> {
	const client = new OpenAI({
		apiKey: config.openaiApiKey,
		baseURL: config.openaiBaseUrl,
	})

	let finalSummary: string | null = null

	const finishTool = defineTool({
		name: 'finish',
		description:
			'Call this when you have gathered all requested information. Provide a complete summary including all IDs, exact field values, and anything the orchestrator will need.',
		schema: z.object({
			summary: z.string().describe('Complete summary of gathered information with exact IDs and field values'),
		}),
		handler: async ({ summary }) => {
			finalSummary = summary
			return 'acknowledged'
		},
	})

	const browserTools = await initBrowserTools()
	const boundTools = [...browserTools, finishTool]
	const toolDefinitions = boundTools.map((t) => t.definition) satisfies Tool[]

	const conversation = await client.conversations.create({
		items: [
			{ role: 'system', content: SUBAGENT_SYSTEM_PROMPT },
			{ role: 'user', content: task },
		],
	})

	let lastMessage = ''
	let inputMessages: ResponseInput = []

	for (let i = 0; i < MAX_SUBAGENT_ITERATIONS; i++) {
		logger.agent('info', `Subagent iteration ${i + 1}/${MAX_SUBAGENT_ITERATIONS}`)

		const isLastIteration = i === MAX_SUBAGENT_ITERATIONS - 1
		const response = await client.responses.create({
			model: config.subagentModel,
			conversation: conversation.id,
			tools: toolDefinitions,
			tool_choice: isLastIteration ? { type: 'function', name: 'finish' } : 'auto',
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
				const text = item.content
					.filter((c) => c.type === 'output_text')
					.map((c) => c.text)
					.join('')
				if (text) lastMessage = text
				logger.agent('info', 'Subagent message', { content: item.content })
			}
			if (item.type === 'function_call') {
				logger.agent('info', `Subagent tool: ${item.name}`)
				try {
					const tool = boundTools.find((t) => t.definition.name === item.name)
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

		if (finalSummary !== null) {
			logger.agent('info', 'Subagent finished with summary')
			return finalSummary
		}
	}

	logger.agent('warn', 'Subagent hit max iterations, returning last message')
	return lastMessage || 'No information gathered'
}
