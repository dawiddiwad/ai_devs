import OpenAI from 'openai'
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'
import { SYSTEM_PROMPT } from './prompts'
import { toolDefinitions, executeTool } from './tools'
import { logger } from './logger'

const FLAG_PATTERN = /\{FLG:[^}]+\}/
const MAX_ITERATIONS = 30
const MAX_RETRIES = 5

export async function runAgent(): Promise<void> {
	const client = new OpenAI()
	const model = process.env.OPENAI_MODEL || 'gpt-5-mini'

	logger.agent('info', 'Using orchestrator model', { model })
	logger.agent('info', 'Using compressor model', { model: process.env.OPENAI_COMPRESSOR_MODEL || 'gpt-4.1-mini' })

	const messages: ChatCompletionMessageParam[] = [
		{ role: 'system', content: SYSTEM_PROMPT },
		{
			role: 'user',
			content:
				'Fetch the power plant failure logs, search for critical events, compress them, and submit. Iterate based on technician feedback until you get the flag.',
		},
	]

	let submissionCount = 0

	for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
		logger.agent('info', `Agent iteration ${iteration + 1}/${MAX_ITERATIONS}`)

		const response = await client.chat.completions.create({
			model,
			messages,
			tools: toolDefinitions,
			temperature: process.env.OPENAI_TEMPERATURE ? parseFloat(process.env.OPENAI_TEMPERATURE) : undefined,
		})

		logger.agent('debug', 'Orchestrator token usage', { usage: response.usage })

		const choice = response.choices[0]
		const assistantMessage = choice.message

		messages.push(assistantMessage)

		if (choice.finish_reason === 'tool_calls' && assistantMessage.tool_calls) {
			const functionCalls = assistantMessage.tool_calls.filter(
				(tc): tc is Extract<typeof tc, { type: 'function' }> => tc.type === 'function'
			)

			logger.agent('info', 'Agent requested tool calls', {
				tools: functionCalls.map((tc) => tc.function.name),
			})

			for (const toolCall of functionCalls) {
				const { name, arguments: args } = toolCall.function

				logger.agent('info', `Dispatching tool: ${name}`, { args })

				const result = await executeTool(name, args)

				messages.push({
					role: 'tool',
					tool_call_id: toolCall.id,
					content: result,
				})

				if (name === 'submit_answer') {
					submissionCount++
					const parsed = JSON.parse(result)

					if (parsed.flagFound) {
						const flagMatch = parsed.flag || parsed.response.match(FLAG_PATTERN)?.[0]
						logger.agent('info', `FLAG FOUND: ${flagMatch}`)
						process.exit(0)
					}

					logger.agent('info', `Submission ${submissionCount}/${MAX_RETRIES} — no flag yet`, {
						feedback: parsed.response,
					})

					if (submissionCount >= MAX_RETRIES) {
						logger.agent('error', 'Max retries reached without capturing flag')
						process.exit(1)
					}
				}
			}
		} else if (choice.finish_reason === 'stop') {
			logger.agent('info', 'Agent finished without tool call', {
				content: assistantMessage.content?.slice(0, 200),
			})

			const content = assistantMessage.content || ''
			const flagMatch = content.match(FLAG_PATTERN)
			if (flagMatch) {
				logger.agent('info', `FLAG FOUND IN TEXT: ${flagMatch[0]}`)
				process.exit(0)
			}

			break
		}
	}

	logger.agent('error', 'Agent loop exhausted without capturing flag')
	process.exit(1)
}
