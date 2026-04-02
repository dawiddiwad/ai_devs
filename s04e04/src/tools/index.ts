import type { AgentTool } from '@ai-devs/core'
import { downloadNotesTool } from './download-notes.js'
import { preprocessNotesTool } from './preprocess-notes.js'
import { submitFilesystemTool } from './submit-filesystem.js'

export const tools: AgentTool[] = [downloadNotesTool, preprocessNotesTool, submitFilesystemTool]
