import { createConfig, defineAgentTool, logger, verifyAnswer } from '@ai-devs/core'
import { z } from 'zod/v4'

const config = createConfig()

const RunRemoteCommandInput = z.object({
	cmd: z.string().min(1).describe('A single shell command to execute on the remote server'),
})

function normalizeCommand(cmd: string): string {
	return cmd.trim()
}

export const runRemoteCommandTool = defineAgentTool({
	name: 'run_remote_command',
	description: 'Execute a single shell command on the remote server through the hub and return the raw response.',
	schema: RunRemoteCommandInput,
	handler: async ({ cmd }) => {
		const normalizedCommand = normalizeCommand(cmd)

		if (!normalizedCommand) {
			return JSON.stringify({ error: 'cmd cannot be empty' })
		}

		logger.tool('info', 'Executing remote shell command', {
			cmd: normalizedCommand,
		})

		try {
			const result = await verifyAnswer(config, { cmd: normalizedCommand })

			logger.tool('info', 'Received remote shell response', {
				cmd: normalizedCommand,
				responseLength: result.responseText.length,
				flagCaptured: !!result.flag,
			})

			return result.responseText
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error)

			logger.tool('error', 'Remote shell command failed', {
				cmd: normalizedCommand,
				error: errorMessage,
			})

			return JSON.stringify({ error: errorMessage })
		}
	},
})
