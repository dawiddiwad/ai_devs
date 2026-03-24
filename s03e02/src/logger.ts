type LogCategory = 'agent' | 'tool' | 'api'
type LogLevel = 'info' | 'warn' | 'error' | 'debug'

function formatLog(category: LogCategory, level: LogLevel, message: string, context?: Record<string, unknown>): string {
	const timestamp = new Date().toISOString()
	const base = `[${timestamp}] [${level.toUpperCase()}] [${category}] ${message}`
	if (context) {
		return `${base} ${JSON.stringify(context)}`
	}
	return base
}

function createCategoryLogger(category: LogCategory) {
	return {
		info: (message: string, context?: Record<string, unknown>) => {
			console.log(formatLog(category, 'info', message, context))
		},
		warn: (message: string, context?: Record<string, unknown>) => {
			console.warn(formatLog(category, 'warn', message, context))
		},
		error: (message: string, context?: Record<string, unknown>) => {
			console.error(formatLog(category, 'error', message, context))
		},
		debug: (message: string, context?: Record<string, unknown>) => {
			console.debug(formatLog(category, 'debug', message, context))
		},
	}
}

export const logger = {
	agent: createCategoryLogger('agent'),
	tool: createCategoryLogger('tool'),
	api: createCategoryLogger('api'),
}
