import { Block, SafetyAnalysis, SafetyStatus } from './types'

const GRID_ROWS = 5
const ROBOT_ROW = 5

function simulateBlock(block: Block): Block {
	let { top_row, bottom_row, direction } = block

	if (direction === 'down' && bottom_row >= GRID_ROWS) {
		direction = 'up'
	} else if (direction === 'up' && top_row <= 1) {
		direction = 'down'
	}

	if (direction === 'down') {
		top_row += 1
		bottom_row += 1
	} else {
		top_row -= 1
		bottom_row -= 1
	}

	return { col: block.col, top_row, bottom_row, direction }
}

function isColumnDangerousAfterMove(blocks: Block[], targetCol: number): boolean {
	for (const block of blocks) {
		if (block.col !== targetCol) continue
		const simulated = simulateBlock(block)
		if (simulated.top_row <= ROBOT_ROW && simulated.bottom_row >= ROBOT_ROW) {
			return true
		}
	}
	return false
}

export function computeSafety(playerCol: number, blocks: Block[]): SafetyAnalysis {
	const checkCol = (col: number): SafetyStatus => {
		if (col < 1 || col > 7) return 'DANGER'
		return isColumnDangerousAfterMove(blocks, col) ? 'DANGER' : 'SAFE'
	}

	return {
		right: checkCol(playerCol + 1),
		wait: checkCol(playerCol),
		left: checkCol(playerCol - 1),
	}
}
