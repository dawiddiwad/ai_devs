import axios from 'axios'
import { config } from './config'
import { logger } from './logger'

const FLAG_REGEX = /\{FLG:.*?\}/
const NO_RESULT_CODE = 11

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

export async function collectResultsBySource(sources: string[], timeoutMs = 40000): Promise<Record<string, unknown>> {
	const collected: Record<string, unknown> = {}
	const deadline = Date.now() + timeoutMs

	while (Object.keys(collected).length < sources.length && Date.now() < deadline) {
		await sleep(500)
		const result = (await callApi('getResult')) as Record<string, unknown>
		if ((result['code'] as number) === NO_RESULT_CODE) {
			continue
		}
		const source = result['sourceFunction'] as string | undefined
		if (source && sources.includes(source)) {
			collected[source] = result
			logger.agent('info', `Collected result for: ${source} (${Object.keys(collected).length}/${sources.length})`)
		} else {
			logger.agent('warn', `Unexpected sourceFunction: ${source}`, {
				result: JSON.stringify(result).slice(0, 200),
			})
		}
	}

	if (Object.keys(collected).length < sources.length) {
		const missing = sources.filter((s) => !(s in collected))
		throw new Error(`Timeout waiting for: ${missing.join(', ')}`)
	}

	return collected
}

export async function collectNResults(source: string, count: number, timeoutMs = 40000): Promise<unknown[]> {
	const results: unknown[] = []
	const deadline = Date.now() + timeoutMs

	while (results.length < count && Date.now() < deadline) {
		await sleep(500)
		const result = (await callApi('getResult')) as Record<string, unknown>
		if ((result['code'] as number) === NO_RESULT_CODE) {
			continue
		}
		if (result['sourceFunction'] === source) {
			results.push(result)
			logger.agent('info', `Collected ${source} result ${results.length}/${count}`)
		} else {
			logger.agent('warn', `Unexpected sourceFunction while collecting ${source}`, {
				got: result['sourceFunction'],
			})
		}
	}

	if (results.length < count) {
		throw new Error(`Timeout: collected ${results.length}/${count} ${source} results`)
	}

	return results
}
