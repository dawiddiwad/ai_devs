import OpenAI from 'openai'
import type { ChatCompletionMessageParam, ChatCompletionTool } from 'openai/resources/chat/completions'
import { config } from './config'
import { logger } from './logger'
import { buildSystemPrompt } from './prompts'
import { fetchDroneDocumentation } from './tools/fetchDroneDocumentation'
import { analyzeMap } from './tools/analyzeMap'
import { sendInstructions } from './tools/sendInstructions'

const MAX_ITERATIONS = 30

const tools: ChatCompletionTool[] = [
	{
		type: 'function',
		function: {
			name: 'fetchDroneDocumentation',
			description:
				'Fetches the drone API documentation HTML page and returns parsed text content for the agent to learn available commands and their usage.',
			parameters: {
				type: 'object',
				properties: {},
				required: [],
			},
		},
	},
	{
		type: 'function',
		function: {
			name: 'analyzeMap',
			description:
				'Sends the drone mission map image to a vision model for analysis. Returns the model description of what it sees on the map including grid structure, features, and coordinates.',
			parameters: {
				type: 'object',
				properties: {},
				required: [],
			},
		},
	},
	{
		type: 'function',
		function: {
			name: 'sendInstructions',
			description:
				'Sends drone instructions to the verify API endpoint and returns the response. Detects flags in the response.',
			parameters: {
				type: 'object',
				properties: {
					instructions: {
						type: 'array',
						items: { type: 'string' },
						description: 'Array of drone instruction strings to send',
					},
				},
				required: ['instructions'],
			},
		},
	},
]

async function executeTool(toolName: string, args: Record<string, unknown>, openaiClient: OpenAI): Promise<string> {
	switch (toolName) {
		case 'fetchDroneDocumentation': {
			const result = await fetchDroneDocumentation()
			return JSON.stringify(result)
		}
		case 'analyzeMap': {
			const result = await analyzeMap(openaiClient)
			return JSON.stringify(result)
		}
		case 'sendInstructions': {
			const result = await sendInstructions(args.instructions as string[])
			return JSON.stringify(result)
		}
		default:
			return JSON.stringify({ error: `Unknown tool: ${toolName}` })
	}
}

export async function runAgent(openaiClient: OpenAI): Promise<void> {
	const messages: ChatCompletionMessageParam[] = [{ role: 'system', content: buildSystemPrompt() }]

	for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
		logger.agent('info', `Agent iteration ${iteration}/${MAX_ITERATIONS}`)

		const response = await openaiClient.chat.completions.create({
			model: config.openaiModel,
			messages,
			tools,
		})

		const choice = response.choices[0]
		if (!choice) {
			logger.agent('error', 'No choice returned from model')
			break
		}

		const assistantMessage = choice.message
		messages.push(assistantMessage)

		if (choice.finish_reason === 'stop' || !assistantMessage.tool_calls?.length) {
			logger.agent('info', 'Agent finished without tool calls', {
				content: assistantMessage.content ?? '',
			})
			break
		}

		for (const toolCall of assistantMessage.tool_calls) {
			if (toolCall.type !== 'function') continue
			const toolName = toolCall.function.name
			const toolArgs = JSON.parse(toolCall.function.arguments || '{}') as Record<string, unknown>

			logger.agent('info', `Agent calling tool: ${toolName}`, { args: toolArgs })

			try {
				const result = await executeTool(toolName, toolArgs, openaiClient)
				logger.tool('info', `Tool ${toolName} completed`, { resultLength: result.length })

				messages.push({
					role: 'tool',
					tool_call_id: toolCall.id,
					content: result,
				})
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : String(error)
				logger.tool('error', `Tool ${toolName} failed`, { error: errorMessage })

				messages.push({
					role: 'tool',
					tool_call_id: toolCall.id,
					content: JSON.stringify({ error: errorMessage }),
				})
			}
		}
	}

	logger.agent('error', 'Max iterations reached without capturing flag')
	process.exit(1)
}
