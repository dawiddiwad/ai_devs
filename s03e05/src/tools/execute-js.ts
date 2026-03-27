import vm from 'vm'
import type { ChatCompletionTool } from 'openai/resources/chat/completions'
import { logger } from '../logger'
import { ExecuteJsArgsSchema } from '../types'

export const executeJsDefinition: ChatCompletionTool = {
	type: 'function',
	function: {
		name: 'execute_js',
		description: `Executes JavaScript code in a sandboxed vanilla JS environment. Use it for any computation, like pathfinding or data processing.`,
		parameters: {
			type: 'object',
			properties: {
				code: {
					type: 'string',
					description:
						'JavaScript code to execute - console.log() output is captured and returned alongside the last expression value. No require, fetch, or process.',
				},
			},
			required: ['code'],
		},
	},
}

export async function executeJs(args: unknown): Promise<string> {
	const parsed = ExecuteJsArgsSchema.safeParse(args)
	if (!parsed.success) {
		return JSON.stringify({ error: `Invalid args: ${parsed.error.message}` })
	}

	const logs: string[] = []

	const sandbox = vm.createContext({
		JSON,
		Math,
		Array,
		Object,
		Map,
		Set,
		String,
		Number,
		Boolean,
		console: {
			log: (...items: unknown[]) => logs.push(items.map((x) => JSON.stringify(x)).join(' ')),
			error: (...items: unknown[]) => logs.push('[error] ' + items.map((x) => JSON.stringify(x)).join(' ')),
		},
	})

	logger.tool('info', 'execute_js', { codeLength: parsed.data.code.length })

	let result: unknown
	try {
		result = vm.runInContext(parsed.data.code, sandbox, { timeout: 5000 })
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		logger.tool('warn', 'execute_js error', { message })
		return JSON.stringify({ error: message, logs })
	}

	logger.tool('debug', 'execute_js result', { result: String(result).slice(0, 200) })
	return JSON.stringify({ result, logs })
}
