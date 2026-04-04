type LogCategory = 'agent' | 'tool' | 'api'
type LogLevel = 'info' | 'warn' | 'error' | 'debug'

function formatTimestamp(): string {
	return new Date().toISOString()
}

function log(category: LogCategory, level: LogLevel, message: string, context?: Record<string, unknown>): void {
	const output = `${formatTimestamp()} [${category.toUpperCase()}] ${level.toUpperCase()}: ${message}${context ? ` | context: ${JSON.stringify(context)}` : ''}`

	switch (level) {
		case 'info':
			console.info(output)
			break
		case 'warn':
			console.warn(output)
			break
		case 'error':
			console.error(output)
			break
		case 'debug':
			console.debug(output)
			break
		default:
			console.log(output)
	}
}

export const logger = {
	agent: (level: LogLevel, message: string, context?: Record<string, unknown>) =>
		log('agent', level, message, context),
	tool: (level: LogLevel, message: string, context?: Record<string, unknown>) => log('tool', level, message, context),
	api: (level: LogLevel, message: string, context?: Record<string, unknown>) => log('api', level, message, context),
}
