import { logger } from './logger.js'
import { createOpenAIClient } from './openai-client.js'
import { safelyObserve } from './observability.js'
import { runCompletionsLoop } from './completions-loop.js'
import { runResponsesLoop } from './responses-loop.js'
import type { AgentApi, AgentConfig, AgentObservability, AgentResult, CoreConfig } from './types.js'

/**
 * Runs an agent loop using either the Responses API or the Chat Completions API,
 * depending on `agentConfig.api`.
 *
 * Input:
 * - `coreConfig`: shared runtime configuration used to create the OpenAI client and
 *   resolve default model/temperature values
 * - `agentConfig`: API-specific agent configuration including prompts, tools, loop
 *   limits, and optional observer/interceptor hooks
 *
 * Output:
 * - returns an `AgentResult` containing the final normalized message, number of
 *   iterations executed, and any captured flag
 *
 * Behavior:
 * - creates an OpenAI client once per run
 * - resolves `model`, `maxIterations`, and `temperature` from agent overrides or
 *   `coreConfig` defaults
 * - routes to `runResponsesLoop()` when `api === 'responses'`
 * - routes to `runCompletionsLoop()` when `api === 'completions'`
 *
 * @example
 * ```ts
 * const result = await runAgent(coreConfig, {
 *   api: 'responses',
 *   tools,
 *   systemPrompt: 'You are a precise analyst.',
 *   userPrompt: 'Solve the task.',
 *   maxIterations: 10,
 * })
 * ```
 *
 * @example
 * ```ts
 * const result = await runAgent(coreConfig, {
 *   api: 'completions',
 *   tools,
 *   systemPrompt: 'You are a concise assistant.',
 *   userPrompt: 'Use tools when needed.',
 *   toolChoice: 'required',
 *   handleNoToolCalls(context) {
 *     return {
 *       action: 'continue',
 *       messages: [...context.messages],
 *     }
 *   },
 * })
 * ```
 */
export async function runAgent<Api extends AgentApi>(
	coreConfig: CoreConfig,
	agentConfig: AgentConfig<Api>
): Promise<AgentResult>

/**
 * Implementation overload for `runAgent()`.
 *
 * This function performs the shared setup work, then delegates to the API-specific
 * loop implementation selected by `agentConfig.api`.
 *
 * @param coreConfig Shared runtime configuration used for client creation and defaults.
 * @param agentConfig API-specific agent configuration for the current run.
 * @returns Final agent result for the completed run.
 */
export async function runAgent(coreConfig: CoreConfig, agentConfig: AgentConfig): Promise<AgentResult> {
	const client = createOpenAIClient(coreConfig)
	const observability = agentConfig.observability as AgentObservability | undefined
	const model = agentConfig.model ?? coreConfig.openaiModel
	const maxIterations = agentConfig.maxIterations ?? 20
	const temperature = agentConfig.temperature ?? coreConfig.openaiTemperature
	const runContext = {
		api: agentConfig.api,
		taskName: coreConfig.taskName,
		model,
		maxIterations,
		temperature,
		systemPrompt: agentConfig.systemPrompt,
		userPrompt: agentConfig.userPrompt,
		toolNames: agentConfig.tools.map((tool) => tool.definition.name),
	} as const

	logger.agent('info', 'Starting agent', {
		api: agentConfig.api,
		model,
		maxIterations,
		toolCount: agentConfig.tools.length,
	})

	const executeRun = async (): Promise<AgentResult> => {
		const runHandle = await safelyObserve('onRunStart', () => observability?.onRunStart?.(runContext), undefined)

		try {
			const result =
				agentConfig.api === 'responses'
					? await runResponsesLoop(client, model, maxIterations, temperature, agentConfig, runHandle)
					: await runCompletionsLoop(client, model, maxIterations, temperature, agentConfig, runHandle)

			await safelyObserve(
				'onRunEnd',
				() => observability?.onRunEnd?.({ api: agentConfig.api, runHandle, result }),
				undefined
			)
			await safelyObserve('flush', () => observability?.flush?.(), undefined)

			return result
		} catch (error) {
			await safelyObserve(
				'onRunError',
				() =>
					observability?.onRunError?.({
						api: agentConfig.api,
						runHandle,
						errorMessage: error instanceof Error ? error.message : String(error),
					}),
				undefined
			)
			await safelyObserve('flush', () => observability?.flush?.(), undefined)
			throw error
		}
	}

	return observability?.withRunContext ? observability.withRunContext(runContext, executeRun) : executeRun()
}
