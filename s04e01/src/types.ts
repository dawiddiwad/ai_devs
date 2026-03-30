import type { Tool } from 'openai/resources/responses/responses'
import type { BoundTool } from './tool-factory'
import { httpRequestTool } from './tools/httpRequest'
import { centralaTool } from './tools/centrala'

export const boundTools: BoundTool[] = [httpRequestTool, centralaTool]

export const toolDefinitions = boundTools.map((t) => t.definition) satisfies Tool[]
