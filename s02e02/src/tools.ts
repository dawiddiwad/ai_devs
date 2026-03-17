import { ToolDefinition, BoardAnalysis } from "./types"
import { fetchBoardImage, fetchTargetImage, rotateTile, resetBoard } from "./api"
import { analyzeImage } from "./vision"

let cachedTarget: BoardAnalysis | null = null

export const toolDefinitions: ToolDefinition[] = [
	{
		type: "function",
		function: {
			name: "analyze_target",
			description:
				"Fetches the solved electricity board PNG, sends the whole image to a vision model, and returns the target cable connections for every cell.",
			parameters: {
				type: "object",
				properties: {},
				required: [],
			},
		},
	},
	{
		type: "function",
		function: {
			name: "analyze_board",
			description:
				"Fetches the current electricity board PNG, sends the whole image to a vision model, and returns the cable connections for every cell.",
			parameters: {
				type: "object",
				properties: {},
				required: [],
			},
		},
	},
	{
		type: "function",
		function: {
			name: "rotate_tile",
			description:
				"Rotates a single tile 90° clockwise. One call = one rotation. To rotate multiple times, call repeatedly.",
			parameters: {
				type: "object",
				properties: {
					position: {
						type: "string",
						description: "Cell position in AxB format, e.g. '2x3'",
					},
				},
				required: ["position"],
			},
		},
	},
	{
		type: "function",
		function: {
			name: "reset_board",
			description: "Resets the puzzle board to its initial state.",
			parameters: {
				type: "object",
				properties: {},
				required: [],
			},
		},
	},
]

export const executeToolCall = async (
	name: string,
	args: Record<string, unknown>,
): Promise<string> => {
	switch (name) {
		case "analyze_target": {
			if (cachedTarget) {
				console.log("[tool] analyze_target (cached)")
				return JSON.stringify(cachedTarget)
			}
			console.log("[tool] analyze_target — fetching and analyzing solved image...")
			const targetImage = await fetchTargetImage()
			const targetBoard = await analyzeImage(targetImage)
			cachedTarget = { board: targetBoard }
			console.log("[tool] analyze_target result:", JSON.stringify(cachedTarget))
			return JSON.stringify(cachedTarget)
		}

		case "analyze_board": {
			console.log("[tool] analyze_board — fetching and analyzing current board...")
			const boardImage = await fetchBoardImage()
			const boardState = await analyzeImage(boardImage)
			const result: BoardAnalysis = { board: boardState }
			console.log("[tool] analyze_board result:", JSON.stringify(result))
			return JSON.stringify(result)
		}

		case "rotate_tile": {
			const position = args.position as string
			console.log(`[tool] rotate_tile — rotating ${position}...`)
			const response = await rotateTile(position)
			const responseStr = JSON.stringify(response)
			console.log(`[tool] rotate_tile result: ${responseStr}`)
			return responseStr
		}

		case "reset_board": {
			console.log("[tool] reset_board — resetting...")
			cachedTarget = null
			const result = await resetBoard()
			console.log(`[tool] reset_board result: ${result}`)
			return result
		}

		default:
			return JSON.stringify({ error: `Unknown tool: ${name}` })
	}
}
