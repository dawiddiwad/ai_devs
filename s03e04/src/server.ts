import express from 'express'
import { config } from './config'
import { logger } from './logger'
import { loadCatalog } from './catalog'
import { createCityFinder } from './city-finder'

const app = express()
app.use(express.json())

const catalog = loadCatalog()
const findCitiesByQuery = createCityFinder(catalog)

app.post('/find', async (req, res) => {
	const params: unknown = req.body?.params
	if (!params || typeof params !== 'string') {
		logger.tool('warn', 'Missing or invalid params', { body: req.body })
		res.json({ output: 'Missing params. Send a natural language item description.' })
		return
	}

	try {
		logger.tool('info', 'Find request', { params })
		const output = await findCitiesByQuery(params)
		logger.tool('info', 'Find response', { output })
		res.json({ output })
	} catch (error) {
		logger.tool('error', 'Find failed', { error: error instanceof Error ? error.message : String(error) })
		res.json({ output: 'Internal error. Try again.' })
	}
})

app.get('/health', (_req, res) => {
	res.json({ status: 'ok' })
})

app.listen(config.serverPort, () => {
	logger.agent('info', 'Tool server running', {
		port: config.serverPort,
		url: `${config.publicBaseUrl}/find`,
	})
})
