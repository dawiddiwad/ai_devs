import OpenAI from 'openai'
import { config } from '../config'
import { logger } from '../logger'
import { mapAnalysisResponseSchema } from '../types'

export async function analyzeMap(openaiClient: OpenAI): Promise<{ description: string }> {
	const mapUrl = config.droneMapUrl
	logger.tool('info', 'Analyzing map via vision model', { mapUrl, model: config.openaiVisionModel })

	const response = await openaiClient.chat.completions.create({
		model: config.openaiVisionModel,
		messages: [
			{
				role: 'user',
				content: [
					{
						type: 'text',
						text: 'Describe this drone mission map in detail. Include any grid structure (rows and columns), labeled features, water bodies, structures (dams, power plants, buildings), terrain types, and notable visual elements. Identify coordinates/sectors for each feature you see.',
					},
					{
						type: 'image_url',
						image_url: { url: mapUrl },
					},
				],
			},
		],
	})

	const description = response.choices[0]?.message?.content ?? ''
	const validated = mapAnalysisResponseSchema.parse({ description })

	logger.tool('info', 'Map analysis complete', { descriptionLength: validated.description.length })

	return { description: validated.description }
}
