import type { AgentTool } from '@ai-devs/core'
import { warehouseApiTool } from './warehouse-api.js'
import { fetchRequirementsTool } from './fetch-requirements.js'

export const tools: AgentTool[] = [warehouseApiTool, fetchRequirementsTool]
