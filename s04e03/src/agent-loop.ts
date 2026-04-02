import OpenAI from 'openai'
import type { ResponseInput, Tool } from 'openai/resources/responses/responses'
import { logger } from './logger'
import { incrementIterations } from './stats'
import type { AgentTool } from './tool-factory'

export interface AgentLoopConfig {
	client: OpenAI
	conversationId: string
	toolDefinitions: Tool[]
	agentTools: AgentTool[]
	maxIterations: number
	model: string
	temperature?: number
	logPrefix: string
	defaultToolChoice?: 'auto' | 'required'
	lastIterationTool?: string
	shouldStop?: () => boolean
	compactionThreshold?: number
	reasoningEffort?: 'none' | 'low' | 'medium' | 'high'
}

export async function runAgentLoop(cfg: AgentLoopConfig): Promise<string> {
	let lastMessage = ''
	let inputMessages: ResponseInput = []

	for (let i = 0; i < cfg.maxIterations; i++) {
		incrementIterations()
		const isLastIteration = i === cfg.maxIterations - 1

		const toolChoice =
			cfg.lastIterationTool && isLastIteration
				? { type: 'function' as const, name: cfg.lastIterationTool }
				: (cfg.defaultToolChoice ?? 'auto')

		logger.agent('info', `${cfg.logPrefix} ${i + 1}/${cfg.maxIterations}`)

		const response = await cfg.client.responses.create({
			model: cfg.model,
			conversation: cfg.conversationId,
			tools: cfg.toolDefinitions,
			tool_choice: toolChoice,
			temperature: cfg.temperature,
			input: inputMessages,
			reasoning: { effort: cfg.reasoningEffort ?? 'none' },
			context_management: [{ type: 'compaction', compact_threshold: cfg.compactionThreshold ?? 50000 }],
			service_tier: 'flex',
		})

		inputMessages = []
		logger.agent('info', `token usage: ${JSON.stringify(response.usage)}`)

		for (const item of response.output) {
			if (item.type === 'message') {
				const text = item.content
					.filter((c) => c.type === 'output_text')
					.map((c) => c.text)
					.join('')
				if (text) lastMessage = text
				logger.agent('info', `${cfg.logPrefix} message`, { text: lastMessage.slice(0, 200) })
			}
			if (item.type === 'code_interpreter_call') {
				logger.tool('info', 'code_interpreter', { len: item.code?.length })
			}
			if (item.type === 'function_call') {
				logger.agent('info', `${cfg.logPrefix} → ${item.name}`)
				try {
					const tool = cfg.agentTools.find((t) => t.definition.name === item.name)
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

		if (cfg.shouldStop?.()) return lastMessage
	}

	return lastMessage
}
