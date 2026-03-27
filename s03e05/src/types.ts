import { z } from 'zod/v4'

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

export const ExecuteJsArgsSchema = z.object({
	code: z.string(),
})

export type ToolSearchArgs = z.infer<typeof ToolSearchArgsSchema>
export type UseToolArgs = z.infer<typeof UseToolArgsSchema>
export type SubmitRouteArgs = z.infer<typeof SubmitRouteArgsSchema>
export type ExecuteJsArgs = z.infer<typeof ExecuteJsArgsSchema>
