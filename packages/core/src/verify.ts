import axios from 'axios'
import { logger } from './logger.js'
import type { CoreConfig, VerifyResult } from './types.js'

const FLAG_REGEX = /\{FLG:[^}]+\}/

export function captureFlag(text: string): string | null {
	const match = text.match(FLAG_REGEX)
	return match ? match[0] : null
}

export async function verifyAnswer(
	config: CoreConfig,
	answer: unknown,
	options?: { task?: string; exitOnFlag?: boolean }
): Promise<VerifyResult> {
	const payload = {
		task: options?.task ?? config.taskName,
		apikey: config.aiDevsApiKey,
		answer,
	}

	logger.api('info', 'Submitting verification', {
		task: payload.task,
	})

	const response = await axios.post(config.verifyEndpoint, payload, {
		validateStatus: () => true,
	})

	const responseText = typeof response.data === 'string'
		? response.data
		: JSON.stringify(response.data)

	logger.api('info', 'Verification response', { response: responseText })

	const flag = captureFlag(responseText)
	if (flag) {
		logger.agent('info', `FLAG CAPTURED: ${flag}`)
		if (options?.exitOnFlag !== false) {
			process.exit(0)
		}
	}

	return { responseText, flag, data: response.data }
}
