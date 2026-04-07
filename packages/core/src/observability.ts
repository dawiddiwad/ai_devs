import { logger } from './logger.js'

const base64DataUriPattern = /data:[^;]+;base64,[A-Za-z0-9+/]+=*/u

function normalizeErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error)
}

export async function safelyObserve<T>(hookName: string, callback: () => Promise<T> | T, fallback: T): Promise<T> {
	try {
		return await callback()
	} catch (error) {
		logger.agent('warn', 'Observability hook failed', {
			hookName,
			error: normalizeErrorMessage(error),
		})
		return fallback
	}
}

export function truncateString(value: string, maxLength: number): string {
	if (value.length <= maxLength || base64DataUriPattern.test(value)) {
		return value
	}

	return `${value.slice(0, maxLength)}... [truncated ${value.length - maxLength} chars]`
}

export function sanitizeForObservability(value: unknown, maxStringLength = 4000, maxDepth = 6): unknown {
	if (maxDepth <= 0) {
		return '[max depth reached]'
	}

	if (typeof value === 'string') {
		return truncateString(value, maxStringLength)
	}

	if (value == null || typeof value === 'number' || typeof value === 'boolean') {
		return value
	}

	if (Array.isArray(value)) {
		return value.map((item) => sanitizeForObservability(item, maxStringLength, maxDepth - 1))
	}

	if (typeof value === 'object') {
		return Object.fromEntries(
			Object.entries(value).map(([key, nestedValue]) => [
				key,
				sanitizeForObservability(nestedValue, maxStringLength, maxDepth - 1),
			])
		)
	}

	return String(value)
}
