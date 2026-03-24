import OpenAI from 'openai'
import type {
	ChatCompletionMessageParam,
	ChatCompletionTool,
	ChatCompletionMessageToolCall,
} from 'openai/resources/chat/completions'
import { z } from 'zod'
import { config } from './config'
import { logger } from './logger'
import { executeShellCommand } from './tools/shell'
import { submitAnswer } from './tools/verify'

const ECCS_REGEX = /ECCS-[a-f0-9]+/i

const SYSTEM_PROMPT = `You are a firmware recovery specialist operating a restricted Linux virtual machine via a shell API. Your goal is to get /opt/firmware/cooler/cooler.bin running and capture the confirmation code it outputs.

## Workflow

1. START: Run \`help\` to discover available commands — do not assume standard Linux commands work.
2. ALWAYS read .gitignore first in any directory you access and do NOT touch files/directories listed there.
3. EXPLORE: Try running the binary. Read error output carefully.
4. FIND PASSWORD: Search the filesystem for a password (it is stored in several locations). Respect security rules.
5. RECONFIGURE: If needed, edit \`settings.ini\` near the binary to fix configuration issues.
6. RUN: Execute the binary again with the correct setup.
7. CAPTURE: The code format is \`ECCS-\` followed by 40 hex characters. Stop once you see it.
8. SUBMIT: Submit the captured ECCS confirmation code for the verification.

## Security Rules (MUST FOLLOW — violations cause API ban)
- Do NOT access \`/etc\`, \`/root\`, or \`/proc/\`
- Respect any \`.gitignore\` files — do not touch files/directories listed there
- You are a regular (non-root) user

## Rules
- Always call \`help\` first — the shell has non-standard commands
- Execute one shell command at a time and reason about the output before the next step
- If banned, wait the indicated number of seconds then retry
- If the system is in a bad state, use the \`reboot\` command to reset
- Do NOT guess or fabricate the code — only submit what appears in command output
- NEVER open or try to explore .bin files contents or using cat, cat-file, etc — they are raw binary data not human-readable and may cause enormous token consumption issues.`

const tools: ChatCompletionTool[] = [
	{
		type: 'function',
		function: {
			name: 'execute_shell_command',
			description: 'Execute a command on the remote VM shell via the shell API.',
			parameters: {
				type: 'object',
				properties: {
					command: {
						type: 'string',
						description: 'The shell command to execute on the remote VM',
					},
				},
				required: ['command'],
			},
		},
	},
	{
		type: 'function',
		function: {
			name: 'wait_seconds',
			description:
				'Wait for a specific number of seconds before continuing. Useful when you are banned or need to wait.',
			parameters: {
				type: 'object',
				properties: {
					seconds: {
						type: 'number',
						description: 'Number of seconds to wait (minimum 20, maximum 120)',
					},
				},
				required: ['seconds'],
			},
		},
	},
	{
		type: 'function',
		function: {
			name: 'submit_answer',
			description: 'Submit the ECCS confirmation code to the verify endpoint.',
			parameters: {
				type: 'object',
				properties: {
					confirmation_code: {
						type: 'string',
						description: 'The ECCS confirmation code extracted from the firmware output',
					},
				},
				required: ['confirmation_code'],
			},
		},
	},
]

const shellCommandSchema = z.object({
	command: z.string(),
})

const waitSecondsSchema = z.object({
	seconds: z.number().min(20).max(120),
})

const submitAnswerSchema = z.object({
	confirmation_code: z.string(),
})

function isFunctionToolCall(
	toolCall: ChatCompletionMessageToolCall
): toolCall is ChatCompletionMessageToolCall & { type: 'function'; function: { name: string; arguments: string } } {
	return toolCall.type === 'function'
}

async function handleToolCall(toolCall: ChatCompletionMessageToolCall): Promise<string> {
	if (!isFunctionToolCall(toolCall)) {
		logger.agent.warn('Received non-function tool call, skipping', { type: toolCall.type })
		return 'Error: unsupported tool call type'
	}

	const functionName = toolCall.function.name
	const rawArgs = toolCall.function.arguments

	logger.agent.info('Processing tool call', { functionName, rawArgs })

	let parsedArgs: unknown
	try {
		parsedArgs = JSON.parse(rawArgs)
	} catch {
		logger.agent.error('Failed to parse tool call arguments', { rawArgs })
		return 'Error: invalid JSON in tool arguments'
	}

	switch (functionName) {
		case 'execute_shell_command': {
			const result = shellCommandSchema.safeParse(parsedArgs)
			if (!result.success) {
				logger.agent.error('Invalid shell command arguments', { errors: result.error.issues })
				return `Error: invalid arguments — ${result.error.message}`
			}
			return await executeShellCommand(result.data.command)
		}
		case 'wait_seconds': {
			const result = waitSecondsSchema.safeParse(parsedArgs)
			if (!result.success) {
				logger.agent.error('Invalid wait_seconds arguments', { errors: result.error.issues })
				return `Error: invalid arguments — ${result.error.message}`
			}
			logger.tool.info(`Waiting for ${result.data.seconds} seconds`)
			await new Promise((resolve) => setTimeout(resolve, result.data.seconds * 1000))
			logger.tool.info('Wait completed')
			return `Waited for ${result.data.seconds} seconds`
		}
		case 'submit_answer': {
			const result = submitAnswerSchema.safeParse(parsedArgs)
			if (!result.success) {
				logger.agent.error('Invalid submit_answer arguments', { errors: result.error.issues })
				return `Error: invalid arguments — ${result.error.message}`
			}
			const response = await submitAnswer(result.data.confirmation_code)
			return JSON.stringify(response)
		}
		default:
			logger.agent.warn('Unknown tool call', { functionName })
			return `Error: unknown tool "${functionName}"`
	}
}

export interface AgentResult {
	flag?: string
	eccsCode?: string
	success: boolean
}

export async function runAgent(): Promise<AgentResult> {
	const openai = new OpenAI({
		apiKey: config.openaiApiKey,
	})

	const messages: ChatCompletionMessageParam[] = [
		{ role: 'system', content: SYSTEM_PROMPT },
		{
			role: 'user',
			content:
				'Begin by running help to discover available commands, then debug and fix the firmware binary at /opt/firmware/cooler/cooler.bin.',
		},
	]

	let allOutputs = ''

	for (let turn = 0; turn < config.agentMaxTurns; turn++) {
		logger.agent.info(`Agent turn ${turn + 1}/${config.agentMaxTurns}`)

		logger.api.info('Calling OpenAI chat completions', { model: config.openaiModel, turn })
		const completion = await openai.chat.completions.create({
			model: config.openaiModel,
			messages,
			tools,
		})

		const choice = completion.choices[0]
		if (!choice) {
			logger.agent.error('No choices in completion response')
			break
		}

		const assistantMessage = choice.message
		messages.push(assistantMessage)

		if (assistantMessage.content) {
			logger.agent.info('Agent response', { content: assistantMessage.content.substring(0, 500) })
			allOutputs += assistantMessage.content + '\n'
		}

		if (choice.finish_reason === 'tool_calls' && assistantMessage.tool_calls?.length) {
			logger.agent.info('Agent requested tool calls', {
				count: assistantMessage.tool_calls.length,
				tools: assistantMessage.tool_calls.map((tc) => (isFunctionToolCall(tc) ? tc.function.name : tc.type)),
			})

			for (const toolCall of assistantMessage.tool_calls) {
				const toolResult = await handleToolCall(toolCall)
				allOutputs += toolResult + '\n'

				messages.push({
					role: 'tool',
					tool_call_id: toolCall.id,
					content: toolResult,
				})

				const eccsMatch = toolResult.match(ECCS_REGEX)
				if (eccsMatch) {
					logger.agent.info('ECCS code found in tool output', { code: eccsMatch[0] })
				}
			}
		} else if (choice.finish_reason === 'stop') {
			logger.agent.info('Agent finished with stop reason')

			const eccsMatch = allOutputs.match(ECCS_REGEX)
			if (eccsMatch) {
				logger.agent.info('Found ECCS code in accumulated outputs, submitting', { code: eccsMatch[0] })
				await submitAnswer(eccsMatch[0])
			}

			logger.agent.warn('Agent stopped without completing the task, continuing with nudge')
			messages.push({
				role: 'user',
				content:
					"You haven't submitted the ECCS code yet. Please continue debugging the firmware and submit the code when found.",
			})
		}
	}

	logger.agent.error('Agent exhausted max turns without capturing flag')
	return { success: false }
}
