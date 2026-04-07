import OpenAI from 'openai'
import type { CoreConfig } from './types.js'

export function createOpenAIClient(config: Pick<CoreConfig, 'openaiApiKey' | 'openaiBaseUrl'>): OpenAI {
	return new OpenAI({
		apiKey: config.openaiApiKey,
		baseURL: config.openaiBaseUrl,
	})
}
