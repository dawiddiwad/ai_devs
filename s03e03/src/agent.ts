import OpenAI from 'openai'
import { zodFunction } from 'openai/helpers/zod'
import { config } from './config'
import { logger } from './logger'
import { LlmDecision, LlmDecisionSchema, ReactorResponse, SafetyAnalysis } from './types'

const client = new OpenAI({
	apiKey: config.openaiApiKey,
	baseURL: config.openaiBaseUrl,
})

const SYSTEM_PROMPT = `You are a robot navigation controller inside a nuclear reactor. Your job is to move the robot safely from column 1 to column 7 along the bottom row of a 7x5 grid.

## Rules

- You can issue exactly ONE command per turn: "right", "wait", or "left"
- Reactor blocks (B) occupy 2 cells each and move up/down one step per turn
- If a block reaches row 5 in your column, you are crushed
- Your goal is to reach column 7 as quickly as possible without being crushed

## Decision Process

You receive:
1. The current board state (ASCII grid)
2. Block positions and their movement directions
3. A programmatic safety analysis for each possible action

Based on this information, choose the safest action that makes progress toward column 7.

Prefer "right" when safe. Use "wait" to let a block pass. Use "left" only to escape danger in your current column.

You MUST call the choose_move tool with your decision.`

const chooseMoveTool = zodFunction({
	name: 'choose_move',
	parameters: LlmDecisionSchema,
	description: 'Choose the next move command for the robot. Call this with your chosen command and reasoning.',
})

function buildBoardAscii(state: ReactorResponse): string {
	const lines: string[] = []
	lines.push('   1  2  3  4  5  6  7')
	for (let row = 0; row < 5; row++) {
		const cells = state.board[row].map((c) => c.padStart(2, ' ')).join(' ')
		lines.push(`${row + 1} ${cells}`)
	}
	return lines.join('\n')
}

function buildUserPrompt(state: ReactorResponse, safety: SafetyAnalysis): string {
	const boardAscii = buildBoardAscii(state)
	const blocksInfo = state.blocks
		.map((b) => `  col ${b.col}: rows ${b.top_row}-${b.bottom_row}, moving ${b.direction}`)
		.join('\n')

	return `Current board state:
${boardAscii}

Robot position: column ${state.player.col}
Goal: column ${state.goal.col}

Block positions and directions:
${blocksInfo}

Safety analysis (simulated one step ahead):
  -> right: ${safety.right}
  || wait:  ${safety.wait}
  <- left:  ${safety.left}

Choose your next command by calling the choose_move tool.`
}

export async function decideMoveWithLlm(state: ReactorResponse, safety: SafetyAnalysis): Promise<LlmDecision> {
	const userPrompt = buildUserPrompt(state, safety)

	logger.agent('info', 'Requesting LLM decision', { playerCol: state.player.col })

	const response = await client.chat.completions.parse({
		model: config.openaiModel,
		temperature: config.openaiTemperature,
		messages: [
			{ role: 'system', content: SYSTEM_PROMPT },
			{ role: 'user', content: userPrompt },
		],
		tools: [chooseMoveTool],
		tool_choice: 'required',
	})

	const message = response.choices[0]?.message
	const toolCall = message?.tool_calls?.[0]

	if (toolCall && toolCall.type === 'function') {
		const parsed = toolCall.function.parsed_arguments as LlmDecision | undefined
		if (parsed) {
			logger.agent('debug', 'LLM tool call parsed', { parsed })
			return LlmDecisionSchema.parse(parsed)
		}
	}

	logger.agent('warn', 'No valid tool call in LLM response, defaulting to wait')
	return { command: 'wait', reasoning: 'No tool call received — waiting for safety' }
}
