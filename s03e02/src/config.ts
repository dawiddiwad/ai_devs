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
	openaiApiKey: requireEnv('OPENAI_API_KEY'),
	openaiModel: requireEnv('OPENAI_MODEL'),
	aiDevsApiKey: requireEnv('AI_DEVS_API_KEY'),
	hubEndpoint: requireEnv('AI_DEVS_HUB_ENDPOINT'),
	taskName: requireEnv('AI_DEVS_TASK_NAME'),
	agentMaxTurns: parseInt(process.env.AGENT_MAX_TURNS || '20', 10),
	get shellApiUrl() {
		return `${this.hubEndpoint}/api/shell`
	},
	get verifyUrl() {
		return `${this.hubEndpoint}/verify`
	},
}
