import { z } from 'zod/v4'
import { defineAgentTool, createConfig, verifyAnswer } from '@ai-devs/core'

const config = createConfig()

export const transmitTool = defineAgentTool({
	name: 'transmit',
	description:
		'Submit the final intelligence report about the city codenamed "Syjon". Only call after COLLECTION_COMPLETE.',
	schema: z.object({
		cityName: z.string().describe('Real Polish city name'),
		cityArea: z.string().describe('City area in km², exactly 2 decimal places, e.g. "12.34"'),
		warehousesCount: z.number().describe('Number of warehouses (integer)'),
		phoneNumber: z.string().describe('Contact phone number, digits only'),
	}),
	handler: async ({ cityName, cityArea, warehousesCount, phoneNumber }) => {
		const result = await verifyAnswer(config, {
			action: 'transmit',
			cityName,
			cityArea,
			warehousesCount,
			phoneNumber,
		})
		return result.responseText
	},
})
