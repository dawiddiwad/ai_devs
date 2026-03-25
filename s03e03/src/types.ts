import { z } from 'zod/v4'

export const BlockSchema = z.object({
	col: z.number(),
	top_row: z.number(),
	bottom_row: z.number(),
	direction: z.enum(['up', 'down']),
})

export const ReactorResponseSchema = z.object({
	code: z.number(),
	message: z.string(),
	board: z.array(z.array(z.string())),
	player: z.object({ col: z.number(), row: z.number() }),
	goal: z.object({ col: z.number(), row: z.number() }),
	blocks: z.array(BlockSchema),
	reached_goal: z.boolean(),
})

export type Block = z.infer<typeof BlockSchema>
export type ReactorResponse = z.infer<typeof ReactorResponseSchema>

export const LlmDecisionSchema = z.object({
	command: z.enum(['right', 'wait', 'left']),
	reasoning: z.string(),
})

export type LlmDecision = z.infer<typeof LlmDecisionSchema>

export type Command = 'start' | 'right' | 'wait' | 'left'

export type SafetyStatus = 'SAFE' | 'DANGER'

export interface SafetyAnalysis {
	right: SafetyStatus
	wait: SafetyStatus
	left: SafetyStatus
}
