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

	const output = `${entry.timestamp} [${entry.category.toUpperCase()}] ${entry.level.toUpperCase()}: ${entry.message}${context ? ` | context: ${JSON.stringify(context)}` : ''}`

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

/**
 * Logger utility for structured logging in the agent framework.
 * Provides methods for logging messages from different categories (agent, tool, api) with various log levels.
 * Each log entry is output as a JSON string containing the timestamp, category, level, message, and optional context.
 * This structured format allows for easy parsing and analysis of logs in production environments.
 *
 * Usage:
 * logger.agent('info', 'Agent started successfully')
 * logger.tool('warn', 'Tool response time is slow', { responseTime: 1200 })
 * logger.api('error', 'API request failed', { endpoint: '/data', statusCode: 500 })
 *
 * The logger can be extended in the future to support additional log levels, categories, or output formats as needed.
 */
export const logger = {
	agent: (level: LogLevel, message: string, context?: Record<string, unknown>) => log('agent', level, message, context),

	tool: (level: LogLevel, message: string, context?: Record<string, unknown>) => log('tool', level, message, context),

	api: (level: LogLevel, message: string, context?: Record<string, unknown>) => log('api', level, message, context),
}
