import { config } from './config'
import { logger } from './logger'
import { sendCommand } from './api'
import { computeSafety } from './safety'
import { decideMoveWithLlm } from './agent'
import { renderReactorState } from './tui'
import { Command, LlmDecision } from './types'

async function main(): Promise<void> {
	logger.agent('info', 'Starting reactor navigation', { maxTurns: config.maxTurns })

	let state = await sendCommand('start')
	let step = 0

	const initialSafety = computeSafety(state.player.col, state.blocks)
	renderReactorState(state, step, initialSafety)

	while (step < config.maxTurns) {
		step++

		const safety = computeSafety(state.player.col, state.blocks)
		const decision: LlmDecision = await decideMoveWithLlm(state, safety)

		let finalCommand: Command = decision.command
		if (safety[finalCommand] === 'DANGER') {
			logger.agent('warn', `Overriding dangerous LLM decision: ${finalCommand}`, { safety })
			if (safety.wait === 'SAFE') {
				finalCommand = 'wait'
			} else if (safety.left === 'SAFE') {
				finalCommand = 'left'
			} else {
				finalCommand = 'wait'
			}
			decision.reasoning = `[OVERRIDDEN] ${decision.reasoning} -> forced ${finalCommand}`
		}

		decision.command = finalCommand

		state = await sendCommand(finalCommand)
		renderReactorState(state, step, safety, decision)

		if (state.reached_goal) {
			logger.agent('info', 'Robot reached the goal!')
			process.exit(0)
		}
	}

	logger.agent('error', 'Max turns exceeded', { step })
	process.exit(1)
}

main().catch((err) => {
	logger.agent('error', 'Fatal error', { error: String(err) })
	process.exit(1)
})
