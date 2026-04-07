import type { AgentTool } from '@ai-devs/core'
import { speakToOperatorTool } from './speak-to-operator.js'
import { startCallTool } from './start-call.js'

export const tools: AgentTool[] = [startCallTool, speakToOperatorTool]
