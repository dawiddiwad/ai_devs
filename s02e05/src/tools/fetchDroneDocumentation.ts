import axios from 'axios'
import { config } from '../config'
import { logger } from '../logger'

export async function fetchDroneDocumentation(): Promise<{ documentation: string }> {
	const url = config.droneDocsUrl
	logger.tool('info', 'Fetching drone documentation', { url })

	const response = await axios.get<string>(url, { responseType: 'text' })
	logger.api('info', 'Drone documentation fetched', { status: response.status })

	const plainText = response.data
		.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
		.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
		.replace(/<[^>]+>/g, ' ')
		.replace(/&nbsp;/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/\s+/g, ' ')
		.trim()

	logger.tool('info', 'Drone documentation parsed', { length: plainText.length })

	return { documentation: plainText }
}
