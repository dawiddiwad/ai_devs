import OpenAI from "openai"
import { toolDefinitions, executeToolCall } from "./tools"
import { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions"

const SYSTEM_PROMPT = `You are an Electricity Puzzle Solver. Your job is to route power through a 3x3 cable grid by rotating cells.

## Board representation
Each cell is addressed as AxB (A=row 1-3 from top, B=column 1-3 from left).
Each cell's cable connections are described as a set of edges: TOP, RIGHT, BOTTOM, LEFT.

## Rotation mechanics
The only allowed operation is 90° clockwise rotation.
One rotation maps: TOP→RIGHT, RIGHT→BOTTOM, BOTTOM→LEFT, LEFT→TOP.
To rotate N times, call rotate_tile N separate times for that cell.

## Your workflow
1. Call analyze_target to get the solved cable connections for all 9 cells.
2. Call analyze_board to get the current cable connections for all 9 cells.
3. For each cell, compare current vs target. Compute how many 90° CW rotations transform the current connections into the target connections (0, 1, 2, or 3).
4. For each cell that needs rotation, call rotate_tile the required number of times.
5. Check every rotate_tile response for {FLG:...}. If found, report it and stop.
6. If no flag after all rotations, call analyze_board again to verify. If mismatches remain, compute corrections and rotate again.
7. If stuck after 2 verification attempts, call reset_board and start over from step 1.

## Rules
- ALWAYS analyze the target first — never guess cable layouts.
- Minimize total rotations. Each rotation costs one API call.
- After computing rotations, double-check your rotation math before executing.
- Vision analysis can be imperfect. Always verify after executing rotations.`

const FLAG_PATTERN = /\{FLG:.*?\}/

const createAgentClient = (): OpenAI => {
	const apiKey = process.env.OPENAI_API_KEY
	const baseURL = process.env.OPENAI_BASE_URL

	if (!apiKey) throw new Error("OPENAI_API_KEY is not set")

	return baseURL
		? new OpenAI({ apiKey, baseURL })
		: new OpenAI({ apiKey })
}

const getAgentModel = (): string => {
	return process.env.OPENAI_MODEL || "gpt-5-mini"
}

const getMaxTurns = (): number => {
	const turns = process.env.AGENT_MAX_TURNS
	return turns ? parseInt(turns, 10) : 15
}

export const runAgentLoop = async (): Promise<string | null> => {
	const client = createAgentClient()
	const model = getAgentModel()
	const maxTurns = getMaxTurns()

	const messages: ChatCompletionMessageParam[] = [
		{ role: "system", content: SYSTEM_PROMPT },
		{ role: "user", content: "Solve the electricity puzzle. Start by analyzing the target, then the current board, compute rotations, and execute them." },
	]

	for (let turn = 0; turn < maxTurns; turn++) {
		console.log(`\n=== Agent turn ${turn + 1}/${maxTurns} ===`)

		const response = await client.chat.completions.create({
			model,
			messages,
			tools: toolDefinitions as ChatCompletionTool[],
			temperature: process.env.OPENAI_TEMPERATURE ? parseFloat(process.env.OPENAI_TEMPERATURE) : undefined,
		})

		const choice = response.choices[0]
		const message = choice.message

		messages.push(message)

		if (message.content) {
			console.log(`[agent] ${message.content}`)
			const flagMatch = message.content.match(FLAG_PATTERN)
			if (flagMatch) {
				return flagMatch[0]
			}
		}

		if (choice.finish_reason === "stop" || !message.tool_calls?.length) {
			console.log("[agent] No more tool calls. Agent finished.")
			break
		}

		for (const toolCall of message.tool_calls) {
			if (!("function" in toolCall)) continue
			const toolName = toolCall.function.name
			const toolArgs = JSON.parse(toolCall.function.arguments || "{}")

			console.log(`[agent] Calling tool: ${toolName}(${JSON.stringify(toolArgs)})`)

			const result = await executeToolCall(toolName, toolArgs)

			const flagMatch = result.match(FLAG_PATTERN)
			if (flagMatch) {
				console.log(`\nFLAG FOUND: ${flagMatch[0]}`)
				messages.push({
					role: "tool",
					tool_call_id: toolCall.id,
					content: result,
				})
				return flagMatch[0]
			}

			messages.push({
				role: "tool",
				tool_call_id: toolCall.id,
				content: result,
			})
		}
	}

	console.log("[agent] Max turns reached without finding flag.")
	return null
}
