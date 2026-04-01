import type { Tool } from 'openai/resources/responses/responses'
import type { AgentTool } from './tool-factory'
import { callApiTool } from './tools/call-api'
import { spawnClusterAgentTool } from './tools/spawn-cluster-agent'

export const agentTools: AgentTool[] = [callApiTool, spawnClusterAgentTool]

export const toolDefinitions = [
	...agentTools.map((t) => t.definition),
	// { type: 'code_interpreter', container: { type: 'auto' } },
] satisfies Tool[]
