import https from 'node:https'
import { z } from 'zod/v4'
import { defineAgentTool, requireEnv, logger } from '@ai-devs/core'

function fetchJson(url: string): Promise<string> {
	return new Promise((resolve, reject) => {
		https
			.get(url, (res) => {
				const chunks: Buffer[] = []
				res.on('data', (chunk: Buffer) => chunks.push(chunk))
				res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
				res.on('error', reject)
			})
			.on('error', reject)
	})
}

export const fetchRequirementsTool = defineAgentTool({
	name: 'fetch_requirements',
	description: 'Fetch the city food requirements JSON file. Returns the full JSON with cities and their goods needs.',
	schema: z.object({}),
	handler: async () => {
		const url = `${requireEnv('AI_DEVS_HUB_ENDPOINT')}/dane/food4cities.json`
		logger.tool('info', 'Fetching city requirements', { url })
		try {
			const body = await fetchJson(url)
			logger.tool('info', 'Requirements fetched', { chars: body.length })
			return body
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			logger.tool('error', 'Failed to fetch requirements', { error: message })
			return JSON.stringify({ error: message })
		}
	},
})
