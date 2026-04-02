import { z } from 'zod/v4'
import { defineAgentTool, createConfig, verifyAnswer, logger } from '@ai-devs/core'

const config = createConfig()

const actionSchema = z.object({
	action: z.string().describe('API action: help, reset, createDir, createFile, listDir, deleteFile, done'),
	path: z
		.string()
		.nullable()
		.describe('File or directory path, e.g. /miasta/krakow. Null when not needed (help, reset, done)'),
	content: z.string().nullable().describe('File content'),
})

export const filesystemApiTool = defineAgentTool({
	name: 'filesystem_api',
	description:
		'Interact with the remote filesystem API. Send one or more actions. For batch mode, pass multiple items in the actions array. Actions: help, reset, createDir, createFile, listDir, deleteFile, done.',
	schema: z.object({
		actions: z.array(actionSchema).describe('Array of action objects. Use a single-element array for one action.'),
	}),
	handler: async ({ actions }) => {
		const cleaned = actions.map((a) => {
			const obj: Record<string, string> = { action: a.action }
			if (a.path) obj.path = a.path
			if (a.content) obj.content = a.content
			return obj
		})

		const isBatch = cleaned.length > 1
		logger.tool('info', 'Filesystem API call', {
			mode: isBatch ? 'batch' : 'single',
			count: cleaned.length,
		})

		const answer = isBatch ? cleaned : cleaned[0]
		const result = await verifyAnswer(config, answer, {
			exitOnFlag: true,
		})

		return result.responseText
	},
})
