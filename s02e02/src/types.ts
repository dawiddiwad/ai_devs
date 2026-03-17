export type Edge = "T" | "R" | "B" | "L"

export type CellPosition = string

export type BoardState = Record<CellPosition, Edge[]>

export interface BoardAnalysis {
	board: BoardState
}

export interface ToolDefinition {
	type: "function"
	function: {
		name: string
		description: string
		parameters: Record<string, unknown>
	}
}

export interface RotateResponse {
	[key: string]: unknown
}

export interface VerifyPayload {
	apikey: string
	task: string
	answer: {
		rotate: string
	}
}
