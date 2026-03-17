import OpenAI from "openai"
import { BoardState, Edge } from "./types"

const analyzePrompt = `You are analyzing a 3x3 electrical cable puzzle board image. The board contains 9 cells arranged in a grid.
Each cell is addressed as AxB where A=row (1-3, top to bottom) and B=column (1-3, left to right).
For each cell, identify which edges have cable/pipe connections in the cell. Use the following single-letter notation for edges:
- T (TOP)
- R (RIGHT)
- B (BOTTOM)
- L (LEFT)

The image may contain labels or content outside the grid — focus only on the 3x3 grid of cable cells.
Return data that strictly matches the provided JSON schema. Do not include markdown, prose, or extra keys.`

const POSITIONS = [
	"1x1", "1x2", "1x3",
	"2x1", "2x2", "2x3",
	"3x1", "3x2", "3x3",
]

const EDGE_VALUES: Edge[] = ["T", "R", "B", "L"]

const BOARD_JSON_SCHEMA = {
	name: "board_state",
	strict: true,
	schema: {
		type: "object",
		description: "Detected cable connections for each cell in the 3x3 board.",
		additionalProperties: false,
		required: POSITIONS,
		properties: POSITIONS.reduce<Record<string, unknown>>((acc, pos) => {
			acc[pos] = {
				type: "array",
				description: `Connected edges for cell ${pos} (T=TOP, R=RIGHT, B=BOTTOM, L=LEFT).`,
				items: {
					type: "string",
					enum: EDGE_VALUES,
					description: "Single connected edge as single-letter string, ex: 'T' for TOP.",
				},
				uniqueItems: true,
			}
			return acc
		}, {}),
	},
} as const

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

const parseBoardResponse = (content: string): BoardState => {
	const cleaned = content.replace(/```json\s*/gi, "").replace(/```/g, "").trim()
	let parsed: Record<string, unknown>

	try {
		parsed = JSON.parse(cleaned)
	} catch {
		const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
		if (!jsonMatch) throw new Error(`Vision model did not return valid JSON: ${content}`)
		parsed = JSON.parse(jsonMatch[0])
	}

	const board: BoardState = {}

	for (const pos of POSITIONS) {
		const raw = parsed[pos]
		if (!raw) {
			board[pos] = []
			continue
		}

		const edges: Edge[] = (Array.isArray(raw) ? raw : String(raw).split(/[,\s]+/))
			.map((e: string) => String(e).trim().toUpperCase())
			.filter((e: string): e is Edge => ["T", "R", "B", "L"].includes(e))

		board[pos] = edges
	}

	return board
}

export const analyzeImage = async (imageBuffer: Buffer): Promise<BoardState> => {
	const client = createVisionClient()
	const model = getVisionModel()
	const base64 = imageBuffer.toString("base64")
	const dataUrl = `data:image/png;base64,${base64}`

	const response = await client.chat.completions.create({
		model,
		response_format: {
			type: "json_schema",
			json_schema: BOARD_JSON_SCHEMA,
		},
		messages: [
			{
				role: "user",
				content: [
					{
						type: "text",
						text: analyzePrompt,
					},
					{
						type: "image_url",
						image_url: { url: dataUrl, detail: "high" },
					},
				],
			},
		],
		max_completion_tokens: 4096,
	})

	const content = response.choices[0]?.message?.content?.trim() || ""
	return parseBoardResponse(content)
}
