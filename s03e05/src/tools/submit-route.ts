import axios from 'axios'
import { config } from '../config'
import { logger } from '../logger'
import { SubmitRouteArgsSchema } from '../types'
import { FunctionTool } from 'openai/resources/responses/responses'

const FLAG_REGEX = /\{FLG:.*?\}/

export const submitRouteDefinition: FunctionTool = {
	type: 'function',
	name: 'submit_route',
	description: 'Submits the planned route to the verification endpoint.',
	parameters: {
		type: 'object',
		properties: {
			answer: {
				type: 'array',
				items: { type: 'string' },
				description: `Route array: first element is always the vehicle name, rest are moves. Use 'dismount' to switch to walk at any point. Example: ["vehicle", "up", "up", "right", "dismount", "right", "down"]`,
			},
		},
		required: ['answer'],
		additionalProperties: false,
	},
	strict: true,
}

export async function submitRoute(args: unknown): Promise<string> {
	const parsed = SubmitRouteArgsSchema.safeParse(args)
	if (!parsed.success) {
		return JSON.stringify({ error: `Invalid args: ${parsed.error.message}` })
	}

	const { answer } = parsed.data
	logger.tool('info', 'submit_route', { answer })

	const response = await axios.post(
		config.aidevsVerifyEndpoint,
		{ task: config.aidevsTaskName, apikey: config.aidevsApiKey, answer },
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
