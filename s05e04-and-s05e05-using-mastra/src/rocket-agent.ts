import { Agent } from '@mastra/core/agent'
import { frequencyScannerTool } from './tools/rocket/frequency-scanner'
import { getRadioHintTool } from './tools/rocket/get-radio-hint'
import { moveRocketTool } from './tools/rocket/move'
import { startGameTool } from './tools/rocket/start-game'
import { Memory } from '@mastra/memory'

const INSTRUCTIONS = `You are an autonomous agent solving the "goingthere" navigation task. Your primary goal is to navigate the simulated rocket successfully to the base in Grudziądz.

Pilot a rocket on a 3×12 grid from column 1 (row 2) to the target base in column 12. Each column has one rock to avoid. Radar traps shoot you down if not disarmed first.

**Before each move, follow this exact sequence exactly once:**
1. Listen to the frequency scanner
2. If it's not 'clear' parse (possibly malformed) JSON for 'frequency' and 'detectionCode' and use them to disarm the radar trap.
3. Get the radio hint and parse it for rock direction (left/right/ahead) — may use nautical language.
4. Choose move but avoid the rock and stay within rows 1–3.

Hints:
- Translate the hint into absolute rows first, confirm the destination row is free based on hint and the last move response, and only move if it matches. If not, re-think.

Flag Capture:
- If you receive a flag in the form of FLG:xxxx immediately tell the user "FLAG CAPTURED: xxxx"`

const WORKING_MEMORY_TEMPLATE = `#### Mistakes to Avoid Next Time, why crash happened, why did you choose the move and how would you avoid it next time - add new and review after each crash:

#### Current Run Notes - clear after each crash:
`

export const rocketAgent = new Agent({
	id: 'rocket-agent',
	name: 'Rocket Agent',
	instructions: INSTRUCTIONS,
	model: 'openai/gpt-5.4-mini',
	tools: {
		startGameTool,
		frequencyScannerTool,
		getRadioHintTool,
		moveRocketTool,
	},
	defaultOptions: {
		toolChoice: 'auto',
		maxSteps: 100,
		maxProcessorRetries: 3,
		providerOptions: {
			openai: {
				reasoningEffort: 'low',
			},
		},
	},
	maxRetries: 3,
	memory: new Memory({
		options: {
			lastMessages: 100,
			workingMemory: {
				enabled: true,
				scope: 'resource',
				template: WORKING_MEMORY_TEMPLATE,
			},
		},
	}),
})
