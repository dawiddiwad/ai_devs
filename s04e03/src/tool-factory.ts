import { z } from 'zod/v4'
import type { FunctionTool } from 'openai/resources/responses/responses'

export interface AgentTool {
	definition: FunctionTool
	execute: (args: unknown) => Promise<string>
}

export function defineAgentTool<T extends z.ZodType>(toolConfig: {
	name: string
	description: string
	schema: T
	strict?: boolean
	handler: (args: z.infer<T>) => Promise<string>
}): AgentTool {
	const jsonSchema = z.toJSONSchema(toolConfig.schema) as Record<string, unknown>
	delete jsonSchema['$schema']

	const definition: FunctionTool = {
		type: 'function',
		name: toolConfig.name,
		description: toolConfig.description,
		parameters: jsonSchema,
		strict: toolConfig.strict ?? true,
	}

	return {
		definition,
		execute: async (args: unknown) => {
			const parsed = toolConfig.schema.safeParse(args)
			if (!parsed.success) {
				return JSON.stringify({ error: `Invalid args: ${parsed.error.message}` })
			}
			return toolConfig.handler(parsed.data)
		},
	}
}
