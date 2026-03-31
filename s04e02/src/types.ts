import { z } from 'zod/v4'

export const ConfigPointSchema = z.object({
	datetime: z.string(),
	pitchAngle: z.number(),
	turbineMode: z.union([z.literal('idle'), z.literal('production')]),
	windMs: z.number(),
})

export type ConfigPoint = z.infer<typeof ConfigPointSchema>

export const AnalysisResultSchema = z.object({
	stormPeriods: z.array(ConfigPointSchema),
	productionPoint: ConfigPointSchema,
})

export type AnalysisResult = z.infer<typeof AnalysisResultSchema>

export interface HelpAction {
	required: string[]
	paramValues?: string[]
	description?: string
}

export interface HelpResponse {
	actions: Record<string, HelpAction>
}
