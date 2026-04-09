import type { AgentTool } from '@ai-devs/core'
import { frequencyScannerTool } from './frequency-scanner.js'
import { getRadioHintTool } from './get-radio-hint.js'
import { moveRocketTool } from './move-rocket.js'
import { startGameTool } from './start-game.js'

export const tools: AgentTool[] = [startGameTool, frequencyScannerTool, getRadioHintTool, moveRocketTool]
