import { callApi, collectNResults, collectResultsBySource, enqueue } from './api'
import { analyzeData } from './analyzer'
import { logger } from './logger'
import type { ConfigPoint, HelpResponse } from './types'

interface UnlockResult {
	unlockCode: string
	signedParams: { startDate: string; startHour: string }
}

function buildUnlockParams(required: string[], point: ConfigPoint): Record<string, unknown> {
	const [startDate, startHour] = point.datetime.split(' ')
	const lookup: Record<string, unknown> = {
		startDate,
		startHour,
		pitchAngle: point.pitchAngle,
		turbineMode: point.turbineMode,
		windMs: point.windMs,
	}
	return Object.fromEntries(required.map((key) => [key, lookup[key]]))
}

export async function run(): Promise<void> {
	logger.agent('info', 'Starting windpower runner')
	await callApi('start')
	logger.agent('info', 'Service window opened')

	const [helpData, documentation] = await Promise.all([
		callApi('help') as Promise<HelpResponse>,
		callApi('get', { param: 'documentation' }),
	])
	const unlockRequired = helpData.actions['unlockCodeGenerator']?.required ?? []
	logger.agent('info', 'Help and docs fetched', { unlockRequired })

	await Promise.all([
		enqueue('get', { param: 'weather' }),
		enqueue('get', { param: 'turbinecheck' }),
		enqueue('get', { param: 'powerplantcheck' }),
	])
	logger.agent('info', 'Queued 3 data jobs')

	const dataResults = await collectResultsBySource(['weather', 'turbinecheck', 'powerplantcheck'])

	const { stormPeriods, productionPoint } = await analyzeData(
		dataResults['weather'],
		dataResults['turbinecheck'],
		dataResults['powerplantcheck'],
		documentation
	)

	const allPoints: ConfigPoint[] = [...stormPeriods, productionPoint]

	await Promise.all(
		allPoints.map((point) => enqueue('unlockCodeGenerator', buildUnlockParams(unlockRequired, point)))
	)
	logger.agent('info', 'Queued unlock code jobs', { count: allPoints.length })

	const unlockResults = (await collectNResults('unlockCodeGenerator', allPoints.length)) as UnlockResult[]

	const configs: Record<string, { pitchAngle: number; turbineMode: string; unlockCode: string }> = {}
	for (const point of allPoints) {
		const [startDate, startHour] = point.datetime.split(' ')
		const match = unlockResults.find(
			(r) => r.signedParams?.startDate === startDate && r.signedParams?.startHour === startHour
		)
		if (!match) {
			throw new Error(`No unlock code found for ${point.datetime}`)
		}
		logger.agent('info', `Unlock code for ${point.datetime}`, { unlockCode: match.unlockCode })
		configs[point.datetime] = {
			pitchAngle: point.pitchAngle,
			turbineMode: point.turbineMode,
			unlockCode: match.unlockCode,
		}
	}

	logger.agent('info', 'Submitting batch config', { entries: Object.keys(configs).length })
	await callApi('config', { configs })

	logger.agent('info', 'Sending done action')
	await callApi('done')

	logger.agent('error', 'Done action completed without flag — check response above')
	process.exit(1)
}
