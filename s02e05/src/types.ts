import { z } from 'zod'

export const sendInstructionsInputSchema = z.object({
	instructions: z.array(z.string()).min(1, 'Instructions array must not be empty'),
})

export type SendInstructionsInput = z.infer<typeof sendInstructionsInputSchema>

export const mapAnalysisResponseSchema = z.object({
	description: z.string().min(1),
})

export const verifyPayloadSchema = z.object({
	apikey: z.string(),
	task: z.string(),
	answer: z.object({
		instructions: z.array(z.string()).min(1),
	}),
})

export type VerifyPayload = z.infer<typeof verifyPayloadSchema>
