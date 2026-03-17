import OpenAI from "openai"
import { zodResponseFormat } from "openai/helpers/zod"
import { z } from "zod"
import { BoardState, Edge } from "./types"

const analyzePrompt = `You are analyzing a 3x3 electrical cable puzzle board image. 
# Board layout
The board is a 3x3 grid of 9 cells identified by thin lines, and each cell has bold lines inside crossing some of its edges perpendicularly.
Each cell is addressed as AxB where A=row (1-3, top to bottom) and B=column (1-3, left to right), example: "1x3" is the top-right cell.

# Task
For each cell, identify which edges are crossed by bold lines. Use the following edge names:
- TOP
- RIGHT
- BOTTOM
- LEFT

# Important
The image may contain labels or content outside the grid - focus only on the 3x3 grid of cells in the middle of the image.`

const POSITIONS = [
	"1x1", "1x2", "1x3",
	"2x1", "2x2", "2x3",
	"3x1", "3x2", "3x3",
] as const

type Position = typeof POSITIONS[number]

const BoardResponseSchema = z.object({
	cells: z.array(
		z.object({
			position: z.enum(POSITIONS).describe("Cell position in AxB format, example: '1x3' being the top-right cell."),
			edges: z.array(
				z.enum(["TOP", "RIGHT", "BOTTOM", "LEFT"]).describe("Edge crossed by a bold line.")
			).describe("Edges crossed by bold lines for this cell, e.g. ['TOP','RIGHT']."),
		})
	).length(9).describe("One entry per cell in the 3x3 board."),
})

const createVisionClient = (): OpenAI => {
	const baseURL = process.env.VISION_BASE_URL
	const apiKey = process.env.VISION_API_KEY || process.env.OPENAI_API_KEY

	if (!apiKey) throw new Error("No API key configured for vision model")

	return baseURL
		? new OpenAI({ apiKey, baseURL })
		: new OpenAI({ apiKey })
}

const getVisionModel = (): string => {
	return process.env.VISION_MODEL || "gpt-5-mini"
}

export const analyzeImage = async (imageBuffer: Buffer): Promise<BoardState> => {
	const client = createVisionClient()
	const model = getVisionModel()
	const base64 = imageBuffer.toString("base64")
	const dataUrl = `data:image/png;base64,${base64}`

	const response = await client.chat.completions.create({
		model,
		response_format: zodResponseFormat(BoardResponseSchema, "board_state"),
		messages: [
			{
				role: "user",
				content: [
					{ type: "text", text: analyzePrompt },
					{ type: "image_url", image_url: { url: dataUrl, detail: "high" } },
				],
			},
		],
	})

	console.log(response.choices)
	const choice = response.choices[0]
	const content = choice?.message?.content?.trim()
	if (!content) {
		const refusal = choice?.message?.refusal
		throw new Error(`Vision model returned empty content. refusal=${refusal}`)
	}

	const parsed = BoardResponseSchema.parse(JSON.parse(content))

	const board: BoardState = Object.fromEntries(POSITIONS.map((pos) => [pos, [] as Edge[]]))

	for (const cell of parsed.cells) {
		board[cell.position as Position] = cell.edges as Edge[]
	}

	return board
}
