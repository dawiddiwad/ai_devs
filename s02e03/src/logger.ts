type LogCategory = 'agent' | 'tool' | 'api'
type LogLevel = 'info' | 'warn' | 'error' | 'debug'

function formatTimestamp(): string {
	return new Date().toISOString()
}

function log(category: LogCategory, level: LogLevel, message: string, context?: Record<string, unknown>): void {
	const entry = {
		timestamp: formatTimestamp(),
		category,
		level,
		message,
		...(context ? { context } : {}),
	}
	const output = JSON.stringify(entry)

	if (level === 'error') {
		console.error(output)
	} else {
		console.log(output)
	}
}

export const logger = {
	agent: (level: LogLevel, message: string, context?: Record<string, unknown>) =>
		log('agent', level, message, context),

	tool: (level: LogLevel, message: string, context?: Record<string, unknown>) => log('tool', level, message, context),

	api: (level: LogLevel, message: string, context?: Record<string, unknown>) => log('api', level, message, context),
}
