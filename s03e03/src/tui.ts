import { ReactorResponse, SafetyAnalysis, SafetyStatus } from './types'

const RESET = '\x1b[0m'
const CYAN = '\x1b[36m'
const CYAN_BOLD = '\x1b[1;36m'
const GREEN = '\x1b[32m'
const GREEN_BOLD = '\x1b[1;32m'
const RED_BG = '\x1b[41;37m'
const DIM = '\x1b[2m'
const RED = '\x1b[31m'
const MAGENTA_BG = '\x1b[45;37m'
const BOLD = '\x1b[1m'

const BAR_WIDTH = 26

function colorSafety(status: SafetyStatus): string {
	const color = status === 'SAFE' ? GREEN : RED
	return `${color}${status}${RESET}`
}

function colorCell(cell: string): string {
	switch (cell) {
		case 'B':
			return `${RED_BG} B ${RESET}`
		case 'P':
			return `${CYAN_BOLD} P ${RESET}`
		case 'G':
			return `${GREEN_BOLD} G ${RESET}`
		default:
			return `${DIM} . ${RESET}`
	}
}

export function renderReactorState(
	state: ReactorResponse,
	step: number,
	safety: SafetyAnalysis,
	decision?: { command: string; reasoning: string }
): void {
	const playerCol = state.player.col
	const goalCol = state.goal.col
	const percentage = Math.round(((playerCol - 1) / (goalCol - 1)) * 100)
	const filled = Math.round((percentage / 100) * BAR_WIDTH)
	const empty = BAR_WIDTH - filled

	const lines: string[] = []

	lines.push('')
	lines.push(
		`${CYAN}REACTOR${RESET}  Step ${BOLD}${String(step).padStart(3, '0')}${RESET}  Robot: ${CYAN_BOLD}col ${playerCol}${RESET}  Goal: ${GREEN_BOLD}col ${goalCol}${RESET}`
	)

	const bar = `${GREEN}${'='.repeat(filled)}${RESET}${DIM}${'-'.repeat(empty)}${RESET}`
	lines.push(`[${bar}] ${percentage}%`)

	lines.push('')
	const header = '   ' + Array.from({ length: 7 }, (_, i) => ` ${i + 1} `).join('')
	lines.push(`${DIM}${header}${RESET}`)

	for (let row = 0; row < 5; row++) {
		const rowNum = `${DIM}${row + 1}${RESET} `
		const cells = state.board[row].map((cell) => colorCell(cell)).join('')
		lines.push(rowNum + cells)
	}

	lines.push('')
	lines.push(
		`Safety:   -> right: ${colorSafety(safety.right)}   || wait: ${colorSafety(safety.wait)}   <- left: ${colorSafety(safety.left)}`
	)

	if (decision) {
		const cmd = decision.command.toUpperCase()
		const arrow = decision.command === 'left' ? '<-' : '->'
		lines.push(`${MAGENTA_BG} LLM ${RESET} ${CYAN_BOLD}${arrow} ${cmd}${RESET} ${decision.reasoning}`)
	}

	lines.push('')
	console.clear()
	console.log(lines.join('\n'))
}
