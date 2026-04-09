import { logger } from '@ai-devs/core'

interface RetryOptions<T> {
	label: string
	attempts: number
	delayMs: number
	operation: (attempt: number) => Promise<T>
}

function sleep(delayMs: number) {
	return new Promise((resolve) => setTimeout(resolve, delayMs))
}

function calculateExponentialBackoffDelay(attempt: number, baseDelay: number = 1000, maxDelay: number = 30000): number {
	const delay = Math.min(baseDelay * 2 ** attempt, maxDelay)
	const jitter = Math.random() * 1000
	return delay + jitter
}

export async function retry<T>({ label, attempts, delayMs, operation }: RetryOptions<T>): Promise<T> {
	let lastError: unknown = null

	for (let attempt = 1; attempt <= attempts; attempt += 1) {
		try {
			return await operation(attempt)
		} catch (error) {
			lastError = error
			const errorMessage = error instanceof Error ? error.message : String(error)

			logger.tool('warn', 'Retryable operation failed', {
				label,
				attempt,
				attempts,
				error: errorMessage,
			})

			if (attempt < attempts) {
				const nextDelay = calculateExponentialBackoffDelay(attempt, delayMs)
				logger.tool('info', `Waiting before next retry attempt`, {
					label,
					attempt,
					delayMs: nextDelay,
				})
				await sleep(nextDelay)
			}
		}
	}

	throw lastError ?? new Error(`Operation failed: ${label}`)
}
