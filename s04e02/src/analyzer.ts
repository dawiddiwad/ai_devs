import OpenAI from 'openai'
import { zodTextFormat } from 'openai/helpers/zod'
import { config } from './config'
import { logger } from './logger'
import { ANALYZE_DATA_PROMPT, PARSE_API_DOCS_PROMPT } from './prompts'
import { ApiActionsSchema, AnalysisResultSchema } from './types'
import type { ApiActions, AnalysisResult } from './types'

const client = new OpenAI({ apiKey: config.openaiApiKey })

export async function parseApiDocs(helpText: string): Promise<ApiActions> {
	logger.agent('info', 'Parsing API docs to discover action names')

	const response = await client.responses.create({
		model: config.openaiModel,
		input: [{ role: 'user', content: PARSE_API_DOCS_PROMPT(helpText) }],
		temperature: config.openaiTemperature,
		text: { format: zodTextFormat(ApiActionsSchema, 'api_actions') },
	})

	const parsed = ApiActionsSchema.parse(JSON.parse(response.output_text))
	logger.agent('info', 'Discovered API actions', parsed as unknown as Record<string, unknown>)
	return parsed
}

export async function analyzeData(
	weatherData: unknown,
	turbineData: unknown,
	powerData: unknown
): Promise<AnalysisResult> {
	logger.agent('info', 'Analyzing turbine data with LLM')

	const response = await client.responses.create({
		model: config.openaiModel,
		input: [{ role: 'user', content: ANALYZE_DATA_PROMPT(weatherData, turbineData, powerData) }],
		temperature: config.openaiTemperature,
		text: { format: zodTextFormat(AnalysisResultSchema, 'analysis_result') },
	})

	const parsed = AnalysisResultSchema.parse(JSON.parse(response.output_text))
	logger.agent('info', 'Analysis complete', {
		storms: parsed.stormPeriods.length,
		production: parsed.productionPoint.datetime,
	})
	return parsed
}
