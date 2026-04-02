import AdmZip from 'adm-zip'
import { defineAgentTool, createConfig, logger } from '@ai-devs/core'
import { z } from 'zod/v4'
import https from 'node:https'

const config = createConfig()
const NOTES_URL = `${config.verifyEndpoint.replace('/verify', '')}/dane/natan_notes.zip`

function downloadBuffer(url: string): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		https
			.get(url, (res) => {
				const chunks: Buffer[] = []
				res.on('data', (chunk: Buffer) => chunks.push(chunk))
				res.on('end', () => resolve(Buffer.concat(chunks)))
				res.on('error', reject)
			})
			.on('error', reject)
	})
}

export const downloadNotesTool = defineAgentTool({
	name: 'download_notes',
	description:
		"Download and extract Natan's notes from the ZIP archive. Returns the concatenated text content of all files.",
	schema: z.object({}),
	handler: async () => {
		logger.tool('info', 'Downloading notes ZIP', { url: NOTES_URL })

		const buffer = await downloadBuffer(NOTES_URL)

		const zip = new AdmZip(buffer)
		const entries = zip.getEntries()

		const contents: string[] = []
		for (const entry of entries) {
			if (entry.isDirectory) continue
			const text = entry.getData().toString('utf-8')
			contents.push(`=== ${entry.entryName} ===\n${text}`)
		}

		const result = contents.join('\n\n')
		logger.tool('info', 'Notes extracted', { files: entries.length, totalChars: result.length })
		return result
	},
})
