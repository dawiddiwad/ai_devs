import { Agent } from '@mastra/core/agent'
import { frequencyScannerTool } from './tools/frequency-scanner'
import { getRadioHintTool } from './tools/get-radio-hint'
import { moveRocketTool } from './tools/move-rocket'
import { startGameTool } from './tools/start-game'
import { Memory } from '@mastra/memory'
import { LibSQLStore } from '@mastra/libsql'

const INSTRUCTIONS = `You are an autonomous agent solving the "goingthere" navigation task. Your primary goal is to navigate the simulated rocket successfully to the base in Grudziądz.

Pilot a rocket on a 3×12 grid from column 1 (row 2) to the target base in column 12. Each column has one rock to avoid. Radar traps shoot you down if not disarmed first.

**Each turn, follow this exact sequence:**
1. Listen to the frequency scanner
2. If it's not 'clear' parse (possibly malformed) JSON for 'frequency' and 'detectionCode' and use them to disarm the radar trap.
3. Get the radio hint and parse it for rock direction (left/right/ahead) — may use nautical language.
4. Choose move (go/left/right) to avoid the rock and stay within rows 1–3.`

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
		storage: new LibSQLStore({
			id: 'rocket-agent-memory',
			url: 'file:./rocket-agent.db',
		}),
	}),
})
