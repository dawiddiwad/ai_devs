import dotenv from 'dotenv'
import path from 'path'

dotenv.config()

function requireEnv(name: string): string {
	const value = process.env[name]
	if (!value) {
		throw new Error(`Missing required environment variable: ${name}`)
	}
	return value
}

export const config = {
	aiDevsApiKey: requireEnv('AI_DEVS_API_KEY'),
	verifyEndpoint: `${requireEnv('AI_DEVS_HUB_ENDPOINT')}/verify`,
	taskName: 'negotiations',
	serverPort: parseInt(process.env['SERVER_PORT'] || '1234', 10),
	publicBaseUrl: requireEnv('PUBLIC_BASE_URL'),
	dataDir: path.resolve(__dirname, '..', 'data'),
}
