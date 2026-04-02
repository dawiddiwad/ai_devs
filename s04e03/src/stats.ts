import { config } from './config'

interface ActionStat {
	total: number
	failed: number
}

interface RunStats {
	startTime: number
	iterations: number
	actionCounts: Record<string, ActionStat>
	actionPointsLeft: number | null
	flagValue: string | null
}

const stats: RunStats = {
	startTime: Date.now(),
	iterations: 0,
	actionCounts: {},
	actionPointsLeft: null,
	flagValue: null,
}

export function recordAction(action: string, failed = false): void {
	if (!stats.actionCounts[action]) {
		stats.actionCounts[action] = { total: 0, failed: 0 }
	}
	stats.actionCounts[action].total++
	if (failed) stats.actionCounts[action].failed++
}

export function updateActionPointsLeft(responseText: string): void {
	try {
		const parsed = JSON.parse(responseText) as unknown
		const found = findPointsInObject(parsed)
		if (found !== null) {
			stats.actionPointsLeft = found
			return
		}
	} catch {
		// ignore JSON parse errors, we'll try regex next
	}

	const patterns = [
		/action\s*points?\s*left[^0-9]*(\d+)/i,
		/points?\s*left[^0-9]*(\d+)/i,
		/remaining\s*points?[^0-9]*(\d+)/i,
		/"points?":\s*(\d+)/i,
	]
	for (const re of patterns) {
		const m = responseText.match(re)
		if (m) {
			stats.actionPointsLeft = parseInt(m[1], 10)
			return
		}
	}
}

function findPointsInObject(obj: unknown, depth = 0): number | null {
	if (depth > 4 || obj === null || typeof obj !== 'object') return null
	const pointKeys = [
		'action_points_left',
		'actionPointsLeft',
		'pointsLeft',
		'points_left',
		'remainingPoints',
		'remaining_points',
		'pointsRemaining',
		'ap',
		'apLeft',
		'ap_left',
		'points',
		'remainingAP',
	]
	const rec = obj as Record<string, unknown>
	for (const key of pointKeys) {
		if (typeof rec[key] === 'number') return rec[key] as number
	}
	for (const val of Object.values(rec)) {
		const found = findPointsInObject(val, depth + 1)
		if (found !== null) return found
	}
	return null
}

export function incrementIterations(): void {
	stats.iterations++
}

export function setFlag(flag: string): void {
	stats.flagValue = flag
}

export function printSummary(result: 'FLAG CAPTURED' | 'MAX ITERATIONS REACHED'): void {
	const elapsedMs = Date.now() - stats.startTime
	const elapsedSec = (elapsedMs / 1000).toFixed(2)
	const totalActions = Object.values(stats.actionCounts).reduce((sum, s) => sum + s.total, 0)

	const metricRows: [string, string][] = []
	if (config.useSubagents) {
		metricRows.push(['Orchestrator', config.orchestratorModel])
		metricRows.push(['Subagent', config.clusterAgentModel])
	} else {
		metricRows.push(['Model', config.orchestratorModel])
	}
	metricRows.push([
		'Action Points Left',
		stats.actionPointsLeft !== null ? String(stats.actionPointsLeft) : 'unknown',
	])
	metricRows.push(['Total Runtime', `${elapsedSec} seconds`])
	metricRows.push(['Agent Iterations', String(stats.iterations)])
	metricRows.push(['Total API Actions', String(totalActions)])
	metricRows.push(['Final Result', result])
	metricRows.push(...(stats.flagValue ? ([['Flag Value', stats.flagValue]] as [string, string][]) : []))

	const actionRows: [string, string][] = Object.entries(stats.actionCounts)
		.sort((a, b) => b[1].total - a[1].total)
		.map(([action, s]) => {
			const countStr =
				s.failed > 0 ? `${s.total} (${s.failed} failed, ${s.total - s.failed} ok)` : String(s.total)
			return [action, countStr]
		})

	printCombinedTable(['Metric', 'Value'], metricRows, ['Action Breakdown', 'Count'], actionRows)
}

function printCombinedTable(
	headers1: [string, string],
	rows1: [string, string][],
	headers2: [string, string],
	rows2: [string, string][]
): void {
	const allRows = [...rows1, [headers2[0], headers2[1]] as [string, string], ...rows2]
	const allHeaders = [headers1, headers2]

	const col1 = Math.max(...allHeaders.map((h) => h[0].length), ...allRows.map((r) => r[0].length)) + 2
	const col2 = Math.max(...allHeaders.map((h) => h[1].length), ...allRows.map((r) => r[1].length)) + 2

	const divider = `+${'-'.repeat(col1 + 2)}+${'-'.repeat(col2 + 2)}+`
	const row = (a: string, b: string) => `| ${a.padEnd(col1)} | ${b.padEnd(col2)} |`

	console.log(divider)
	console.log(row(headers1[0], headers1[1]))
	console.log(divider)
	for (const [a, b] of rows1) console.log(row(a, b))
	console.log(divider)
	console.log(row(headers2[0], headers2[1]))
	console.log(divider)
	for (const [a, b] of rows2) console.log(row(a, b))
	console.log(divider)
}
