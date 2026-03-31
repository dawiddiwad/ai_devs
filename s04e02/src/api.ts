import axios from 'axios'
import { config } from './config'
import { logger } from './logger'

const FLAG_REGEX = /\{FLG:.*?\}/

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

	logger.api('info', `← ${action} [${response.status}]`, { preview: text.slice(0, 300) })

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

export async function queueJob(action: string, params: Record<string, unknown> = {}): Promise<string> {
	const result = (await callApi(action, params)) as Record<string, unknown>
	const jobId = result['jobId'] ?? result['id'] ?? result['taskId']
	if (typeof jobId !== 'string' && typeof jobId !== 'number') {
		throw new Error(`No jobId in response for ${action}: ${JSON.stringify(result)}`)
	}
	return String(jobId)
}

export async function pollResult(jobId: string, timeoutMs = 25000): Promise<unknown> {
	const deadline = Date.now() + timeoutMs
	while (Date.now() < deadline) {
		await sleep(700)
		const result = (await callApi('getResult', { jobId })) as Record<string, unknown>
		const status = result['status']
		if (status !== 'pending' && status !== 'processing' && status !== 'queued' && status !== 'in_progress') {
			return result
		}
	}
	throw new Error(`Timeout polling jobId: ${jobId}`)
}

export async function pollAll(jobIds: string[]): Promise<unknown[]> {
	return Promise.all(jobIds.map((id) => pollResult(id)))
}
