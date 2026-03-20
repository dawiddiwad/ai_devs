import dotenv from 'dotenv'

dotenv.config()

function requireEnv(name: string): string {
	const value = process.env[name]
	if (!value) {
		throw new Error(`Missing required environment variable: ${name}`)
	}
	return value
}

const hubEndpoint = requireEnv('AI_DEVS_HUB_ENDPOINT')

export const config = {
	openaiBaseUrl: process.env['OPENAI_BASE_URL'] || undefined,
	openaiApiKey: requireEnv('OPENAI_API_KEY'),
	openaiModel: process.env['OPENAI_MODEL'] || 'gpt-5-mini',
	openaiVisionModel: process.env['OPENAI_VISION_MODEL'] || 'gpt-5.4',
	aiDevsApiKey: requireEnv('AI_DEVS_API_KEY'),
	verifyEndpoint: `${hubEndpoint}/verify`,
	taskName: requireEnv('AI_DEVS_TASK_NAME'),
	droneDocsUrl: `${hubEndpoint}/dane/drone.html`,
	droneMapUrl: `${hubEndpoint}/data/${requireEnv('AI_DEVS_API_KEY')}/drone.png`,
}
