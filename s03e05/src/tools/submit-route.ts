import axios from 'axios'
import type { ChatCompletionTool } from 'openai/resources/chat/completions'
import { config } from '../config'
import { logger } from '../logger'
import { SubmitRouteArgsSchema } from '../types'

const FLAG_REGEX = /\{FLG:.*?\}/

export const submitRouteDefinition: ChatCompletionTool = {
	type: 'function',
	function: {
		name: 'submit_route',
		description: 'Submits the planned route to the verification endpoint.',
		parameters: {
			type: 'object',
			properties: {
				answer: {
					type: 'array',
					items: { type: 'string' },
					description:
						'Route array: first element is always the vehicle name, rest are moves (up/down/left/right)',
				},
			},
			required: ['answer'],
		},
	},
}

export async function submitRoute(args: unknown): Promise<string> {
	const parsed = SubmitRouteArgsSchema.safeParse(args)
	if (!parsed.success) {
		return JSON.stringify({ error: `Invalid args: ${parsed.error.message}` })
	}

	const { answer } = parsed.data
	logger.tool('info', 'submit_route', { answer })

	const response = await axios.post(
		config.verifyEndpoint,
		{ task: config.taskName, apikey: config.aiDevsApiKey, answer },
		{ validateStatus: () => true }
	)

	logger.api('info', 'verify response', { status: response.status })

	const responseText = typeof response.data === 'string' ? response.data : JSON.stringify(response.data)

	const flagMatch = responseText.match(FLAG_REGEX)
	if (flagMatch) {
		logger.agent('info', `FLAG CAPTURED: ${flagMatch[0]}`)
		process.exit(0)
	}

	return responseText
}
