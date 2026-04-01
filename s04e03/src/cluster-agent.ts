import OpenAI from 'openai'
import type { ResponseInput, Tool } from 'openai/resources/responses/responses'
import { z } from 'zod/v4'
import { config } from './config'
import { logger } from './logger'
import { CLUSTER_AGENT_SYSTEM_PROMPT } from './prompts'
import { defineAgentTool } from './tool-factory'
import { callApiTool } from './tools/call-api'
import { incrementIterations } from './stats'

const MAX_CLUSTER_ITERATIONS = 20

export async function runClusterAgent(planJson: string): Promise<string> {
	const client = new OpenAI({
		apiKey: config.openaiApiKey,
		baseURL: config.openaiBaseUrl,
	})

	let finalSummary: string | null = null

	const finishTool = defineAgentTool({
		name: 'finish',
		description:
			'Call this when you have either found the NPC or exhausted all cells in your cluster. Report the outcome.',
		schema: z.object({
			summary: z
				.string()
				.describe(
					'Either "found at XN" (e.g. "found at F6") or "cluster clear" if no NPC was found or any error message if something went wrong and you could not complete the mission'
				),
		}),
		handler: async ({ summary }) => {
			finalSummary = summary
			return 'acknowledged'
		},
	})

	const boundTools = [callApiTool, finishTool]
	const toolDefinitions = boundTools.map((t) => t.definition) satisfies Tool[]

	const conversation = await client.conversations.create({
		items: [
			{ role: 'system', content: CLUSTER_AGENT_SYSTEM_PROMPT },
			{ role: 'user', content: planJson },
		],
	})

	let lastMessage = ''
	let inputMessages: ResponseInput = []

	for (let i = 0; i < MAX_CLUSTER_ITERATIONS; i++) {
		incrementIterations()
		const isLastIteration = i === MAX_CLUSTER_ITERATIONS - 1
		logger.agent('info', `Cluster agent iteration ${i + 1}/${MAX_CLUSTER_ITERATIONS}`)

		const response = await client.responses.create({
			model: config.clusterAgentModel,
			conversation: conversation.id,
			tools: toolDefinitions,
			tool_choice: isLastIteration ? { type: 'function', name: 'finish' } : 'auto',
			temperature: config.openaiTemperature,
			input: inputMessages,
			reasoning: {
				effort: 'low',
			},
			context_management: [{ type: 'compaction', compact_threshold: 50000 }],
		})

		inputMessages = []
		for (const item of response.output) {
			if (item.type === 'message') {
				const text = item.content
					.filter((c) => c.type === 'output_text')
					.map((c) => c.text)
					.join('')
				if (text) lastMessage = text
				logger.agent('info', 'Cluster agent message', { content: item.content })
			}
			if (item.type === 'function_call') {
				logger.agent('info', `Cluster agent tool: ${item.name}`, { args: item.arguments })
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
			logger.agent('info', `Cluster agent finished: ${finalSummary}`)
			return finalSummary
		}
	}

	logger.agent('warn', 'Cluster agent hit max iterations')
	return lastMessage || 'cluster clear'
}
