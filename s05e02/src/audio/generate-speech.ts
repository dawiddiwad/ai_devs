import { createConfig, createOpenAIClient, logger } from '@ai-devs/core'

const config = createConfig({
	requiredEnv: {
		ttsApiKey: 'TTS_API_KEY',
	},
	optionalEnv: {
		ttsBaseUrl: { name: 'TTS_BASE_URL', fallback: 'https://api.openai.com/v1' },
		ttsModel: { name: 'TTS_MODEL', fallback: 'gpt-4o-mini-tts-2025-12-15' },
		ttsVoice: { name: 'TTS_VOICE', fallback: 'alloy' },
	},
})

export type GeneratedSpeechResult = {
	base64: string
	format: 'mp3'
}

export async function generateSpeech(text: string): Promise<GeneratedSpeechResult> {
	try {
		logger.api('info', 'Requesting native speech generation', {
			model: config.ttsModel,
			voice: config.ttsVoice,
			textLength: text.length,
		})

		const client = createOpenAIClient({
			openaiApiKey: config.ttsApiKey,
			openaiBaseUrl: config.ttsBaseUrl,
		})

		const response = await client.audio.speech.create({
			input: text,
			model: config.ttsModel,
			voice: config.ttsVoice,
		})

		const audioBinary = await response.arrayBuffer().then((buffer) => Buffer.from(buffer).toString('base64'))

		if (!audioBinary) {
			logger.api('error', 'Speech generation returned no audio', {
				response: JSON.stringify(response, null, 2).slice(0, 200),
			})

			throw new Error('Speech generation returned no audio payload')
		}

		logger.api('info', 'Native speech generation complete', {
			bytes: audioBinary.length,
		})

		return {
			base64: audioBinary,
			format: 'mp3',
		}
	} catch (error) {
		logger.api('error', 'Native speech generation failed', {
			error: error,
		})

		throw new Error(`Native speech generation failed: ${error}`)
	}
}
