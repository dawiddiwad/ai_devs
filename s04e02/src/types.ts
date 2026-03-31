import { z } from 'zod/v4'

export const ApiActionsSchema = z.object({
	weatherAction: z.string(),
	turbineAction: z.string(),
	powerAction: z.string(),
	unlockCodeParams: z.array(z.string()),
})

export type ApiActions = z.infer<typeof ApiActionsSchema>

export const ConfigPointSchema = z.object({
	datetime: z.string(),
	pitchAngle: z.number(),
	turbineMode: z.union([z.literal('idle'), z.literal('production')]),
})

export type ConfigPoint = z.infer<typeof ConfigPointSchema>

export const AnalysisResultSchema = z.object({
	stormPeriods: z.array(ConfigPointSchema),
	productionPoint: ConfigPointSchema,
})

export type AnalysisResult = z.infer<typeof AnalysisResultSchema>
