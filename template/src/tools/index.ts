import type { AgentTool } from '@ai-devs/core'
import { verifyTool } from './verify.js'

export const tools: AgentTool[] = [verifyTool]
