import axios from 'axios'
import { createConfig, verifyAnswer } from '@ai-devs/core'
import { retry } from '../utils/retry'

const config = createConfig({
	requiredEnv: {
		hubBaseUrl: 'AI_DEVS_HUB_ENDPOINT',
	},
})

const TIMETRAVEL_DOCS_URL = `${config.hubBaseUrl}/dane/timetravel.md`

const timetravelConfig = createConfig({ taskName: 'timetravel' })

let protectionLevelsPromise: Promise<Map<number, number>> | null = null

export function submitTimetravelAnswer(answer: unknown) {
	return verifyAnswer(timetravelConfig, answer)
}

async function loadProtectionLevels(): Promise<Map<number, number>> {
	const markdown = await retry({
		label: 'timetravel documentation fetch',
		attempts: 3,
		delayMs: 1000,
		operation: async () => {
			const response = await axios.get(TIMETRAVEL_DOCS_URL, {
				validateStatus: () => true,
				responseType: 'text',
			})

			if (response.status >= 400) {
				throw new Error(`Failed to fetch timetravel documentation with status ${response.status}`)
			}

			return String(response.data)
		},
	})

	const protectionLevels = new Map<number, number>()
	const matches = markdown.matchAll(/\|\s*(\d{4})\s*\|\s*(\d{2})\s*/g)

	for (const match of matches) {
		const year = Number(match[1])
		const protectionLevel = Number(match[2])
		protectionLevels.set(year, protectionLevel)
	}

	if (protectionLevels.size !== 1000) {
		throw new Error(`Expected 1000 protection level entries, got ${protectionLevels.size}`)
	}

	return protectionLevels
}

export async function getProtectionLevel(year: number): Promise<number> {
	if (!protectionLevelsPromise) {
		protectionLevelsPromise = loadProtectionLevels()
	}

	const protectionLevels = await protectionLevelsPromise
	const protectionLevel = protectionLevels.get(year)

	if (protectionLevel === undefined) {
		throw new Error(`No protection level found for year ${year}`)
	}

	return protectionLevel
}

export function getExpectedInternalMode(year: number): number {
	if (year < 2000) {
		return 1
	}

	if (year <= 2150) {
		return 2
	}

	if (year <= 2300) {
		return 3
	}

	return 4
}

export function getSyncRatio(day: number, month: number, year: number) {
	const weightedSum = day * 8 + month * 12 + year * 7
	const moduloValue = weightedSum % 101
	const syncRatio = Number((moduloValue / 100).toFixed(2))

	return {
		weightedSum,
		moduloValue,
		syncRatio,
		syncRatioDisplay: syncRatio.toFixed(2),
	}
}
