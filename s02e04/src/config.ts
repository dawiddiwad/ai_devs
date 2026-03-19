import dotenv from 'dotenv'

dotenv.config()

function requireEnv(name: string): string {
	const value = process.env[name]
	if (!value) {
		throw new Error(`Missing required environment variable: ${name}`)
	}
	return value
}

export const config = {
	openaiBaseUrl: process.env['OPENAI_BASE_URL'] || undefined,
	openaiApiKey: requireEnv('OPENAI_API_KEY'),
	openaiModel: process.env['OPENAI_MODEL'] || 'gpt-4o-mini',
	aiDevsApiKey: requireEnv('AI_DEVS_API_KEY'),
	zmailEndpoint: 'https://***hub_endpoint***/api/zmail',
	verifyEndpoint: 'https://***hub_endpoint***/verify',
	taskName: 'mailbox',
}
