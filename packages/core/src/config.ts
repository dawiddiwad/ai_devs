import dotenv from 'dotenv'
import type { CoreConfig } from './types.js'

export function requireEnv(name: string): string {
	const value = process.env[name]
	if (!value) {
		throw new Error(`Missing required environment variable: ${name}`)
	}
	return value
}

export function optionalEnv(name: string, fallback?: string): string | undefined {
	return process.env[name] || fallback
}

export function createConfig(overrides?: Partial<CoreConfig>): CoreConfig {
	dotenv.config()
	return {
		openaiBaseUrl: process.env['OPENAI_BASE_URL'] || undefined,
		openaiApiKey: requireEnv('OPENAI_API_KEY'),
		openaiModel: process.env['OPENAI_MODEL'] || 'gpt-5-mini',
		openaiTemperature: process.env['OPENAI_TEMPERATURE']
			? parseFloat(process.env['OPENAI_TEMPERATURE'])
			: undefined,
		aiDevsApiKey: requireEnv('AI_DEVS_API_KEY'),
		verifyEndpoint: `${requireEnv('AI_DEVS_HUB_ENDPOINT')}/verify`,
		taskName: requireEnv('AI_DEVS_TASK_NAME'),
		...overrides,
	}
}
