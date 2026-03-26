import express from 'express'
import { config } from './config'
import { logger } from './logger'
import { loadData, findCitiesByQuery } from './data-loader'

const app = express()
app.use(express.json())

app.post('/find', (req, res) => {
	const params: unknown = req.body?.params
	if (!params || typeof params !== 'string') {
		logger.tool('warn', 'Missing or invalid params', { body: req.body })
		res.json({ output: 'Missing params. Send a natural language item description.' })
		return
	}

	logger.tool('info', 'Find request', { params })
	const output = findCitiesByQuery(params)
	logger.tool('info', 'Find response', { output })
	res.json({ output })
})

app.get('/health', (_req, res) => {
	res.json({ status: 'ok' })
})

function startServer(): void {
	loadData()
	app.listen(config.serverPort, () => {
		logger.agent('info', `Tool server running`, {
			port: config.serverPort,
			url: `${config.publicBaseUrl}/find`,
		})
	})
}

startServer()
