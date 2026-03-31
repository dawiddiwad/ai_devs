import axios from 'axios'
import { config } from './config'
import { logger } from './logger'

const FLAG_REGEX = /\{FLG:.*?\}/
const NO_RESULT_CODE = 11
const QUEUE_CONFIRMATION_CODES = new Set([14, 21, 31, 41])

const resultPool: Record<string, unknown>[] = []

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function callApi(action: string, params: Record<string, unknown> = {}): Promise<unknown> {
	const payload = {
		apikey: config.aiDevsApiKey,
		task: config.taskName,
		answer: { action, ...params },
	}

	logger.api('info', `→ ${action}`, params)

	const response = await axios.post(config.verifyEndpoint, payload, { validateStatus: () => true })
	const text = typeof response.data === 'string' ? response.data : JSON.stringify(response.data)

	logger.api('info', `← ${action} [${response.status}]`, { preview: text.slice(0, 600) })

	const flagMatch = text.match(FLAG_REGEX)
	if (flagMatch) {
		logger.agent('info', `FLAG CAPTURED: ${flagMatch[0]}`)
		process.exit(0)
	}

	try {
		return JSON.parse(text)
	} catch {
		return text
	}
}

export async function enqueue(action: string, params: Record<string, unknown> = {}): Promise<void> {
	await callApi(action, params)
}

export async function collectMatchingResult(
	predicate: (r: Record<string, unknown>) => boolean,
	timeoutMs = 30000
): Promise<Record<string, unknown>> {
	const deadline = Date.now() + timeoutMs

	while (Date.now() < deadline) {
		const idx = resultPool.findIndex(predicate)
		if (idx >= 0) {
			return resultPool.splice(idx, 1)[0]
		}

		await sleep(500)
		const result = (await callApi('getResult')) as Record<string, unknown>

		if ((result['code'] as number) === NO_RESULT_CODE) {
			continue
		}

		if (predicate(result)) {
			return result
		}

		resultPool.push(result)
		logger.agent('debug', `Pooled result for later`, { sourceFunction: result['sourceFunction'] })
	}

	throw new Error('Timeout: no matching result found')
}

export function isQueueConfirmation(response: unknown): boolean {
	const r = response as Record<string, unknown>
	return QUEUE_CONFIRMATION_CODES.has(r['code'] as number)
}
