import OpenAI from 'openai'
import { zodTextFormat } from 'openai/helpers/zod'
import { config } from './config'
import { logger } from './logger'
import { ANALYZE_DATA_PROMPT } from './prompts'
import { AnalysisResultSchema } from './types'
import type { AnalysisResult } from './types'

const client = new OpenAI({ apiKey: config.openaiApiKey })

export async function analyzeData(
	weatherData: unknown,
	turbineData: unknown,
	powerData: unknown,
	documentation: unknown
): Promise<AnalysisResult> {
	logger.agent('info', 'Analyzing turbine data with LLM')

	const response = await client.responses.create({
		model: config.openaiModel,
		input: [{ role: 'user', content: ANALYZE_DATA_PROMPT(weatherData, turbineData, powerData, documentation) }],
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
