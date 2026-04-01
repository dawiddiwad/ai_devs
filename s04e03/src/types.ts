import type { Tool } from 'openai/resources/responses/responses'
import type { AgentTool } from './tool-factory'
import { callApiTool } from './tools/call-api'

export const agentTools: AgentTool[] = [callApiTool]

export const toolDefinitions = [
	...agentTools.map((t) => t.definition),
	{ type: 'code_interpreter', container: { type: 'auto' } },
] satisfies Tool[]
