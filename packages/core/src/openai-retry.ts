import { logger } from './logger.js'

const retryDelaySeconds = [1, 2, 4, 8, 16, 32, 60, 120] as const

type RetryableStatusCode = 408 | 409 | 429 | 500 | 502 | 503 | 504

const retryableStatusCodes = new Set<RetryableStatusCode>([408, 409, 429, 500, 502, 503, 504])
const retryableErrorNames = new Set([
	'APIConnectionError',
	'APIConnectionTimeoutError',
	'InternalServerError',
	'RateLimitError',
	'ConflictError',
])
const retryableErrorCodes = new Set([
	'ECONNABORTED',
	'ECONNREFUSED',
	'ECONNRESET',
	'EAI_AGAIN',
	'ENETUNREACH',
	'ENOTFOUND',
	'ETIMEDOUT',
	'UND_ERR_CONNECT_TIMEOUT',
	'UND_ERR_HEADERS_TIMEOUT',
	'UND_ERR_SOCKET',
])

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, ms)
	})
}

function safeStringify(value: unknown): string {
	try {
		return JSON.stringify(value)
	} catch {
		return String(value)
	}
}

function normalizeErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		const ownProps = Object.fromEntries(Object.entries(error as Error & Record<string, unknown>))
		return Object.keys(ownProps).length === 0 ? error.message : `${error.message} ${safeStringify(ownProps)}`
	}

	return safeStringify(error)
}

function getErrorStatus(error: unknown): number | undefined {
	if (!error || typeof error !== 'object') {
		return undefined
	}

	const candidate = error as { status?: unknown }
	return typeof candidate.status === 'number' ? candidate.status : undefined
}

function getErrorName(error: unknown): string | undefined {
	if (!error || typeof error !== 'object') {
		return undefined
	}

	const candidate = error as { name?: unknown }
	return typeof candidate.name === 'string' ? candidate.name : undefined
}

function getErrorCode(error: unknown): string | undefined {
	if (!error || typeof error !== 'object') {
		return undefined
	}

	const candidate = error as { code?: unknown; cause?: { code?: unknown } }
	if (typeof candidate.code === 'string') {
		return candidate.code
	}

	return typeof candidate.cause?.code === 'string' ? candidate.cause.code : undefined
}

function shouldSkipRateLimitRetry(error: unknown): boolean {
	return getErrorStatus(error) === 429 && /balance|credit/i.test(normalizeErrorMessage(error))
}

export function isRetryableOpenAIError(error: unknown): boolean {
	if (shouldSkipRateLimitRetry(error)) {
		return false
	}

	const status = getErrorStatus(error)
	if (status !== undefined) {
		return retryableStatusCodes.has(status as RetryableStatusCode)
	}

	const name = getErrorName(error)
	if (name && retryableErrorNames.has(name)) {
		return true
	}

	const code = getErrorCode(error)
	if (code && retryableErrorCodes.has(code)) {
		return true
	}

	return false
}

export function calculateRetryDelayMs(baseDelaySeconds: number): number {
	const jitterMultiplier = 1 + (Math.random() * 0.2 - 0.1)
	return Math.round(baseDelaySeconds * 1000 * jitterMultiplier)
}

export async function withOpenAIRetry<T>(operation: string, request: () => Promise<T>): Promise<T> {
	let attempt = 0

	while (attempt < 10) {
		try {
			return await request()
		} catch (error) {
			if (!isRetryableOpenAIError(error) || attempt >= retryDelaySeconds.length) {
				throw error
			}

			const delayMs = calculateRetryDelayMs(retryDelaySeconds[attempt])
			const status = getErrorStatus(error)
			const name = getErrorName(error)
			const code = getErrorCode(error)

			logger.api('warn', 'OpenAI request failed; retrying', {
				operation,
				attempt: attempt + 1,
				nextAttempt: attempt + 2,
				delayMs,
				status,
				name,
				code,
				error: normalizeErrorMessage(error),
			})

			await sleep(delayMs)
			attempt += 1
		}
	}
	throw new Error(`Failed ${operation} after ${attempt} attempts`)
}
