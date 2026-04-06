import type { AgentTool } from '@ai-devs/core'
import { listenTool } from './listen'
import { transmitTool } from './transmit'

export const tools: AgentTool[] = [listenTool, transmitTool]
