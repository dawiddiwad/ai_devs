import dotenv from 'dotenv'

dotenv.config()

function requireEnv(name: string): string {
	const value = process.env[name]
	if (!value) {
		throw new Error(`Missing required environment variable: ${name}`)
	}
	return value
}

/**
 * Configuration module for the agent framework.
 * Loads environment variables using dotenv and provides a structured config object for use throughout the application.
 * The requireEnv function ensures that all necessary environment variables are present, throwing an error if any are missing.
 * This centralizes configuration management and allows for easy access to settings like API keys, model names, and endpoint URLs.
 * The config object can be extended in the future to include additional settings as needed.
 */
export const config = {
	openaiBaseUrl: process.env['OPENAI_BASE_URL'] || undefined,
	openaiApiKey: requireEnv('OPENAI_API_KEY'),
	openaiModel: process.env['OPENAI_MODEL'] || 'gpt-5-mini',
	openaiTemperature: process.env['OPENAI_TEMPERATURE'] ? parseFloat(process.env['OPENAI_TEMPERATURE']) : undefined,
	aiDevsApiKey: requireEnv('AI_DEVS_API_KEY'),
	verifyEndpoint: `${requireEnv('AI_DEVS_HUB_ENDPOINT')}/verify`,
	taskName: requireEnv('AI_DEVS_TASK_NAME'),
	sensorsDataUrl: `${requireEnv('AI_DEVS_HUB_ENDPOINT')}/dane/sensors.zip`,
	dataDir: 'data',
}
