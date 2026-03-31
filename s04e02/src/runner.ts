import { callApi, pollAll, queueJob } from './api'
import { analyzeData, parseApiDocs } from './analyzer'
import { logger } from './logger'
import type { ConfigPoint } from './types'

export async function run(): Promise<void> {
	logger.agent('info', 'Starting windpower runner')

	const helpResult = await callApi('help')
	const helpText = typeof helpResult === 'string' ? helpResult : JSON.stringify(helpResult)
	logger.agent('info', 'API docs received', { length: helpText.length })

	const apiActions = await parseApiDocs(helpText)

	await callApi('start')
	logger.agent('info', 'Service window opened')

	const [weatherJobId, turbineJobId, powerJobId] = await Promise.all([
		queueJob(apiActions.weatherAction),
		queueJob(apiActions.turbineAction),
		queueJob(apiActions.powerAction),
	])
	logger.agent('info', 'Async jobs queued', { weatherJobId, turbineJobId, powerJobId })

	const [weatherResult, turbineResult, powerResult] = await pollAll([weatherJobId, turbineJobId, powerJobId])
	logger.agent('info', 'All async results received')

	const { stormPeriods, productionPoint } = await analyzeData(weatherResult, turbineResult, powerResult)

	const allPoints: ConfigPoint[] = [...stormPeriods, productionPoint]

	const unlockJobIds = await Promise.all(
		allPoints.map((point) => {
			const [startDate, startHour] = point.datetime.split(' ')
			const unlockParams: Record<string, unknown> = {
				startDate,
				startHour,
				pitchAngle: point.pitchAngle,
				turbineMode: point.turbineMode,
			}
			return queueJob('unlockCodeGenerator', unlockParams)
		})
	)
	logger.agent('info', 'Unlock code jobs queued', { count: unlockJobIds.length })

	const unlockResults = await pollAll(unlockJobIds)
	logger.agent('info', 'Unlock codes received')

	const configs: Record<string, { pitchAngle: number; turbineMode: string; unlockCode: string }> = {}
	for (let i = 0; i < allPoints.length; i++) {
		const point = allPoints[i]
		const codeResult = unlockResults[i] as Record<string, unknown>
		const unlockCode =
			codeResult['code'] ?? codeResult['unlockCode'] ?? codeResult['result'] ?? String(unlockResults[i])
		configs[point.datetime] = {
			pitchAngle: point.pitchAngle,
			turbineMode: point.turbineMode,
			unlockCode: String(unlockCode),
		}
	}

	logger.agent('info', 'Submitting batch config', { entries: Object.keys(configs).length })
	await callApi('config', { configs })

	logger.agent('info', 'Running turbine check')
	const checkResult = await callApi('turbinecheck')
	logger.agent('info', 'Turbine check result', { result: JSON.stringify(checkResult).slice(0, 200) })

	logger.agent('info', 'Sending done action')
	await callApi('done')

	logger.agent('error', 'Done action completed without flag — check response above')
	process.exit(1)
}
