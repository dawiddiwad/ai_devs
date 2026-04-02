import type { Tool } from 'openai/resources/responses/responses'
import type { AgentTool } from './tool-factory'
import { callApiTool } from './tools/call-api'
import { spawnClusterAgentTool } from './tools/spawn-cluster-agent'
import { config } from './config'

export const agentTools: AgentTool[] = [callApiTool, spawnClusterAgentTool]

export const toolDefinitions = (() => {
	const tools: Tool[] = [...agentTools.map((t) => t.definition)]
	if (config.useCodeTool) {
		tools.push({ type: 'code_interpreter', container: { type: 'auto' } })
	}
	return tools
})() satisfies Tool[]
