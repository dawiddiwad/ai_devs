import { z } from 'zod'
import type { ChatCompletionTool } from 'openai/resources/chat/completions'

export const emailRequestSchema = z
	.object({
		action: z
			.string()
			.describe(
				'The zmail API action to call according to the api documentation, call it with action "help" first to discover available actions.'
			),
	})
	.loose()

export const waitSchema = z.object({
	seconds: z.number().optional().describe('Number of seconds to wait (default: 30)'),
})

export const delegateSchema = z.object({
	instruction: z.string().describe('Precise instruction for the finder agent describing what to search for and how'),
})

export const submitAnswerSchema = z.object({
	password: z.string().describe('The employee system password'),
	date: z.string().describe('The attack date in YYYY-MM-DD format'),
	confirmation_code: z.string().describe('The SEC- confirmation code (36 chars)'),
})

export const finishSchema = z.object({
	flag: z.string().describe('The captured flag string'),
})

export const finderTools: ChatCompletionTool[] = [
	{
		type: 'function',
		function: {
			name: 'email_request',
			description:
				'Send a request to the zmail API. Pass any action and its parameters. Call help first to discover available actions.',
			parameters: {
				type: 'object',
				properties: {
					action: {
						type: 'string',
						description:
							'The zmail API action (e.g. help, getInbox, getThread, getMessages, search). Discover actions by calling with action "help" first.',
					},
				},
				required: ['action'],
				additionalProperties: true,
			},
		},
	},
	{
		type: 'function',
		function: {
			name: 'wait',
			description:
				'Wait for a specified number of seconds. Use this BEFORE retrying when emails are not found yet.',
			parameters: {
				type: 'object',
				properties: {
					seconds: { type: 'number', description: 'Seconds to wait. Default: 30' },
				},
			},
		},
	},
]

export const coordinatorTools: ChatCompletionTool[] = [
	{
		type: 'function',
		function: {
			name: 'delegate',
			description:
				'Spawn a generic finder agent with a specific instruction. The finder has access to the mailbox API (email_request + wait) and will follow your instruction autonomously.',
			parameters: {
				type: 'object',
				properties: {
					instruction: {
						type: 'string',
						description:
							'Precise instruction for the finder agent: what to search for, what keywords/strategies to use, expected format of the result.',
					},
				},
				required: ['instruction'],
			},
		},
	},
	{
		type: 'function',
		function: {
			name: 'submitAnswer',
			description: 'Submit the collected answer to the hub verify endpoint.',
			parameters: {
				type: 'object',
				properties: {
					password: {
						type: 'string',
						description: 'The employee system password',
					},
					date: {
						type: 'string',
						description: 'The attack date in YYYY-MM-DD format',
					},
					confirmation_code: {
						type: 'string',
						description: 'The SEC- confirmation code (36 chars)',
					},
				},
				required: ['password', 'date', 'confirmation_code'],
			},
		},
	},
	{
		type: 'function',
		function: {
			name: 'finish',
			description: 'Terminate the agent loop successfully after the flag has been captured.',
			parameters: {
				type: 'object',
				properties: {
					flag: {
						type: 'string',
						description: 'The captured flag string',
					},
				},
				required: ['flag'],
			},
		},
	},
]
