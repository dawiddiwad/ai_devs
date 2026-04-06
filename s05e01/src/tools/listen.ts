import { z } from 'zod/v4'
import { defineAgentTool, createConfig, logger } from '@ai-devs/core'
import type { AgentToolAudioResult, AgentToolImageResult } from '@ai-devs/core'

const config = createConfig()

const FILESIZE_LIMIT = 5_000_000

const ListenResponse = z.object({
	code: z.number(),
	message: z.string(),
	transcription: z.string().optional(),
	meta: z.string().optional(),
	attachment: z.string().optional(),
	filesize: z.number().optional(),
})

export const listenTool = defineAgentTool({
	name: 'listen',
	description: 'Receive the next intercepted radio signal. Call repeatedly until COLLECTION_COMPLETE is returned.',
	schema: z.object({}),
	handler: async (): Promise<string | AgentToolImageResult | AgentToolAudioResult> => {
		const payload = {
			apikey: config.aiDevsApiKey,
			task: config.taskName,
			answer: { action: 'listen' },
		}

		const res = await fetch(config.verifyEndpoint, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload),
		})
		const response = await res.json()

		const parsed = ListenResponse.parse(response)

		if (parsed.code !== 100) {
			logger.tool('info', 'Collection complete', { code: parsed.code, message: parsed.message })
			return 'COLLECTION_COMPLETE: no more signals'
		}

		if (parsed.transcription) {
			logger.tool('info', 'Received transcription', { length: parsed.transcription.length })
			return parsed.transcription
		}

		if (parsed.attachment && parsed.meta) {
			const mimeType = parsed.meta
			const filesize = parsed.filesize ?? parsed.attachment.length
			const buffer = Buffer.from(parsed.attachment, 'base64')

			if (filesize > FILESIZE_LIMIT) {
				logger.tool('warn', 'Attachment too large, skipping', { mimeType, filesize })
				return `Radio noise: attachment too large to process (${mimeType}, ${filesize} bytes)`
			}

			if (mimeType.startsWith('image/')) {
				logger.tool('info', 'Received image attachment', { mimeType, filesize })
				try {
					return {
						type: 'image',
						base64: buffer.toString('base64'),
						mimeType,
						text: `Intercepted image signal (${mimeType})`,
					} satisfies AgentToolImageResult
				} catch (error) {
					logger.tool('error', `Failed to process image attachment of mime type ${mimeType}`, {
						error: error instanceof Error ? error.message : String(error),
					})
				}
			}

			if (mimeType.startsWith('audio/')) {
				logger.tool('info', 'Received audio attachment', { mimeType, filesize })
				try {
					return {
						type: 'audio',
						base64: buffer.toString('base64'),
						format: 'wav',
					} satisfies AgentToolAudioResult
				} catch (error) {
					logger.tool('error', `Failed to process wav audio attachment`, {
						error: error instanceof Error ? error.message : String(error),
					})
				}
			}

			if (mimeType === 'application/json' || mimeType.startsWith('text/')) {
				const decoded = Buffer.from(parsed.attachment, 'base64').toString('utf-8')
				logger.tool('info', 'Decoded text/json attachment', { mimeType, length: decoded.length })
				return decoded satisfies string
			}

			logger.tool('warn', 'Unknown binary attachment, skipping', { mimeType, filesize })
			return `Radio noise: unrecognized signal format (${mimeType})`
		}

		logger.tool('info', 'Empty signal received', { message: parsed.message })
		return `Signal received but no useful content: ${parsed.message}`
	},
})
