import { logger } from '@ai-devs/core'
import { UniversalEdgeTTS } from 'edge-tts-universal'

export type GeneratedSpeechResult = {
	base64: string
	format: 'mp3'
}

export async function generateSpeech(text: string): Promise<GeneratedSpeechResult> {
	try {
		const tts = new UniversalEdgeTTS(text, 'pl-PL-MarekNeural')
		const result = await tts.synthesize()
		const audioBinary = await result.audio.arrayBuffer().then((buffer) => Buffer.from(buffer).toString('base64'))

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
