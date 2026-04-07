import { defineAgentTool, logger } from '@ai-devs/core'
import type { AgentToolAudioResult } from '@ai-devs/core'
import { z } from 'zod/v4'
import { generateSpeech } from '../audio/generate-speech.js'
import { sendMessageToOperator } from '../hub.js'

const MAX_MESSAGE_LENGTH = 500

function normalizeMessageText(messageText: string): string {
	return messageText.replace(/\s+/g, ' ').trim()
}

export const speakToOperatorTool = defineAgentTool({
	name: 'speak_to_operator',
	description: 'Convert a short Polish utterance to audio, send it to the operator, and return the operator reply.',
	schema: z.object({
		messageText: z.string().describe('A short Polish utterance to synthesize and send to the operator'),
	}),
	handler: async ({ messageText }): Promise<string | AgentToolAudioResult> => {
		if (/\n\s*\n/.test(messageText)) {
			return JSON.stringify({ error: 'messageText looks like a multi-paragraph monologue' })
		}

		const normalizedMessage = normalizeMessageText(messageText)

		if (!normalizedMessage) {
			return JSON.stringify({ error: 'messageText cannot be empty' })
		}

		if (normalizedMessage.length > MAX_MESSAGE_LENGTH) {
			return JSON.stringify({
				error: `messageText is too long (${normalizedMessage.length}/${MAX_MESSAGE_LENGTH})`,
			})
		}

		try {
			logger.tool('info', 'Preparing spoken operator message', {
				messageText: normalizedMessage,
			})

			const speech = await generateSpeech(normalizedMessage)
			const response = await sendMessageToOperator({ audio: speech.base64 })

			logger.tool('info', 'Operator replied with audio', {
				bytes: response.audio.length,
				transcriptLength: response.message.length,
			})

			return {
				type: 'audio',
				format: 'mp3',
				base64: response.audio,
				transcript: response.message,
			}
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error)

			logger.tool('error', 'Failed to speak to operator', { error: errorMessage })
			return JSON.stringify({ error: errorMessage })
		}
	},
})
