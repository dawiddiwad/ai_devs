import type { BoundTool } from './tool-factory'
import { spawnSubagentTool } from './tools/spawnSubagent'
import { centralaTool } from './tools/centrala'

export const staticBoundTools: BoundTool[] = [spawnSubagentTool, centralaTool]
