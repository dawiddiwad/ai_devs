import type { AgentTool } from '@ai-devs/core'
import { runRemoteCommandTool } from './run-remote-command.js'

export const tools: AgentTool[] = [runRemoteCommandTool]
