import type { AgentTool } from '@ai-devs/core'
import { downloadNotesTool } from './download-notes.js'
import { filesystemApiTool } from './filesystem-api.js'

export const tools: AgentTool[] = [downloadNotesTool, filesystemApiTool]
