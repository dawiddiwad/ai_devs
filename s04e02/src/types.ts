import { z } from 'zod/v4'
import { callApiTool } from './tools/call-api'

export const agentTools = [callApiTool]

export const ConfigPointSchema = z.object({
	datetime: z.string(),
	pitchAngle: z.number(),
	turbineMode: z.union([z.literal('idle'), z.literal('production')]),
	windMs: z.number(),
})

export type ConfigPoint = z.infer<typeof ConfigPointSchema>

export interface HelpAction {
	required: string[]
	paramValues?: string[]
	description?: string
}

export interface HelpResponse {
	actions: Record<string, HelpAction>
}
