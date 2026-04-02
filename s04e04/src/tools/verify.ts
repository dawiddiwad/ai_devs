import { z } from 'zod/v4'
import { defineAgentTool, createConfig, verifyAnswer } from '@ai-devs/core'

const config = createConfig()

export const verifyTool = defineAgentTool({
	name: 'verify_answer',
	description: 'Submit an answer for verification. Returns the response text which may contain hints on failure.',
	schema: z.object({
		answer: z.unknown().describe('The answer to submit'),
	}),
	handler: async ({ answer }) => {
		const result = await verifyAnswer(config, answer)
		return result.responseText
	},
})
