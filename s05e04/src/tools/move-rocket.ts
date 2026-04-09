import { createConfig, defineAgentTool, logger, verifyAnswer } from '@ai-devs/core'
import { AxiosResponse } from 'axios'
import { z } from 'zod/v4'

const config = createConfig()

export const filterHupResponse = (response: AxiosResponse): { repeat: boolean; reason?: string } => {
	const responseAsString = JSON.stringify(response.data)

	if (responseAsString.length > 1000) {
		return { repeat: true, reason: `Response too long to display with ${responseAsString.length} characters` }
	}

	if (response.status >= 400) {
		return {
			repeat: true,
			reason: `Frequency scanner returned error with status ${response.status}, details: ${responseAsString}`,
		}
	}

	if (responseAsString.toLocaleLowerCase().includes('crash')) {
		return {
			repeat: true,
			reason: `Rocket crashed, please restart, details: ${responseAsString}`,
		}
	}

	return { repeat: false }
}

export const moveRocketTool = defineAgentTool({
	name: 'move_rocket',
	description: 'Move the rocket and return the raw response payload.',
	schema: z.object({
		command: z
			.enum(['go', 'left', 'right'])
			.describe(
				'The movement command to send to the rocket. Rules: right move to row + 1 and is only allowed if currently in row 1 or 2, left move to row - 1 and is only allowed if currently in row 2 or 3. Movement is not allowed if it would move the rocket out of bounds (row < 1 or row > 3) or into a row occupied by a rock.'
			),
	}),
	handler: async ({ command }) => {
		logger.tool('info', 'Moving rocket', { command })

		try {
			const result = await verifyAnswer(config, { command })

			logger.tool('info', 'Rocket move completed', {
				command,
				response: JSON.stringify(result.responseText),
			})

			return result.responseText
		} catch (error) {
			logger.tool('error', 'Failed to move rocket', {
				command,
				error: error,
			})

			return JSON.stringify({ status: 'error', message: error })
		}
	},
})
