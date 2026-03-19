import { z } from 'zod'
import type { ChatCompletionTool } from 'openai/resources/chat/completions'

export const getInboxSchema = z.object({
	page: z.number().optional().describe('Page number, >= 1. Default: 1'),
	perPage: z.number().optional().describe('Items per page, 5-20. Default: 5'),
})

export const getThreadSchema = z.object({
	threadID: z.number().describe('Numeric thread identifier'),
})

export const getMessagesSchema = z.object({
	ids: z
		.union([z.number(), z.string(), z.array(z.union([z.number(), z.string()]))])
		.describe('Numeric rowID, 32-char messageID, or an array of them'),
})

export const searchSchema = z.object({
	query: z
		.string()
		.describe(
			'Search query. Supports words, "phrase", -exclude, from:, to:, subject:, subject:"phrase", subject:(phrase), OR, AND. Missing operator means AND.'
		),
	page: z.number().optional().describe('Page number, >= 1. Default: 1'),
	perPage: z.number().optional().describe('Items per page, 5-20. Default: 5'),
})

export const waitSchema = z.object({
	seconds: z.number().optional().describe('Number of seconds to wait (default: 30)'),
})

export const delegateSchema = z.object({
	agentType: z
		.enum(['dateFinder', 'passwordFinder', 'confirmationCodeFinder'])
		.describe('Which specialized agent to invoke'),
	context: z.string().optional().describe('Additional context or instructions for the sub-agent'),
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
			name: 'getInbox',
			description: 'Return list of threads in the mailbox. No message body.',
			parameters: {
				type: 'object',
				properties: {
					page: { type: 'number', description: 'Page number, >= 1. Default: 1' },
					perPage: { type: 'number', description: 'Items per page, 5-20. Default: 5' },
				},
			},
		},
	},
	{
		type: 'function',
		function: {
			name: 'getThread',
			description: 'Return rowID and messageID list for a selected thread. No message body.',
			parameters: {
				type: 'object',
				properties: {
					threadID: { type: 'number', description: 'Required. Numeric thread identifier.' },
				},
				required: ['threadID'],
			},
		},
	},
	{
		type: 'function',
		function: {
			name: 'getMessages',
			description: 'Return one or more full messages by rowID or 32-char messageID.',
			parameters: {
				type: 'object',
				properties: {
					ids: {
						description: 'Numeric rowID, 32-char messageID, or an array of them.',
						oneOf: [
							{ type: 'number' },
							{ type: 'string' },
							{ type: 'array', items: { oneOf: [{ type: 'number' }, { type: 'string' }] } },
						],
					},
				},
				required: ['ids'],
			},
		},
	},
	{
		type: 'function',
		function: {
			name: 'search',
			description:
				'Search messages with full-text style query and Gmail-like operators. Returns metadata, not body.',
			parameters: {
				type: 'object',
				properties: {
					query: {
						type: 'string',
						description:
							'Supports words, "phrase", -exclude, from:, to:, subject:, subject:"phrase", subject:(phrase), OR, AND. Missing operator means AND.',
					},
					page: { type: 'number', description: 'Page number, >= 1. Default: 1' },
					perPage: { type: 'number', description: 'Items per page, 5-20. Default: 5' },
				},
				required: ['query'],
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
	{
		type: 'function',
		function: {
			name: 'help',
			description:
				'Discover available mailbox API actions and their parameters. Call this FIRST to learn what actions are available.',
			parameters: {
				type: 'object',
				properties: {},
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
				'Delegate a search task to a specialized sub-agent. Opens a new conversation with the sub-agent and returns the result.',
			parameters: {
				type: 'object',
				properties: {
					agentType: {
						type: 'string',
						enum: ['dateFinder', 'passwordFinder', 'confirmationCodeFinder'],
						description: 'Which specialized agent to invoke',
					},
					context: {
						type: 'string',
						description:
							'Additional context or instructions for the sub-agent (e.g., hub feedback from a previous attempt)',
					},
				},
				required: ['agentType'],
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
