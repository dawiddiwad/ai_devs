import axios from 'axios'
import { config } from '../config'
import { logger } from '../logger'

export async function executeShellCommand(command: string): Promise<string> {
	logger.tool.info('Executing shell command', { command })

	try {
		logger.api.info('POST shell API', { url: config.shellApiUrl })
		const response = await axios.post(
			config.shellApiUrl,
			{ apikey: config.aiDevsApiKey, cmd: command },
			{ validateStatus: () => true }
		)

		logger.api.info('Shell API response', {
			status: response.status,
			data: typeof response.data === 'string' ? response.data.substring(0, 500) : response.data,
		})

		const output = typeof response.data === 'string' ? response.data : JSON.stringify(response.data)
		if (response.status === 200) {
			return output
		} else return `HTTP status ${response.status}: ${output}`
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		logger.tool.error('Shell API request failed', { error: message })
		return `Error: Shell API request failed — ${message}`
	}
}
