import { Tool } from 'openai/resources/responses/responses'
import { z } from 'zod/v4'
import { submitRoute, submitRouteDefinition } from './tools/submit-route'
import { toolSearch, searchToolDefinition } from './tools/tool-search'
import { useTool, useToolDefinition } from './tools/use-tool'

export const ToolSearchArgsSchema = z.object({
	query: z.string(),
})

export const UseToolArgsSchema = z.object({
	endpoint: z.url(),
	query: z.string(),
	reasoning: z.string().max(300),
})

export const SubmitRouteArgsSchema = z.object({
	answer: z.array(z.string()).min(1),
})

export const toolExecutors: Record<string, (args: unknown) => Promise<string>> = {
	tool_search: toolSearch,
	use_tool: useTool,
	submit_route: submitRoute,
}

export const toolDefinitions = [
	searchToolDefinition,
	useToolDefinition,
	submitRouteDefinition,
	{
		type: 'code_interpreter',
		container: { type: 'auto', memory_limit: '1g' },
	},
] satisfies Tool[]

export type ToolSearchArgs = z.infer<typeof ToolSearchArgsSchema>
export type UseToolArgs = z.infer<typeof UseToolArgsSchema>
export type SubmitRouteArgs = z.infer<typeof SubmitRouteArgsSchema>
