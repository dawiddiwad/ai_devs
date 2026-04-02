import OpenAI from 'openai'
import type { CoreConfig } from './types.js'

export function createOpenAIClient(config: CoreConfig): OpenAI {
	return new OpenAI({
		apiKey: config.openaiApiKey,
		baseURL: config.openaiBaseUrl,
	})
}
