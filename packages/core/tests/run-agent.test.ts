import { afterEach, describe, expect, it, vi } from 'vitest'

const { createOpenAIClientMock, runResponsesLoopMock, runCompletionsLoopMock } = vi.hoisted(() => ({
	createOpenAIClientMock: vi.fn(),
	runResponsesLoopMock: vi.fn(),
	runCompletionsLoopMock: vi.fn(),
}))

vi.mock('../src/openai-client.js', () => ({
	createOpenAIClient: createOpenAIClientMock,
}))

vi.mock('../src/responses-loop.js', () => ({
	runResponsesLoop: runResponsesLoopMock,
}))

vi.mock('../src/completions-loop.js', () => ({
	runCompletionsLoop: runCompletionsLoopMock,
}))

import { runAgent } from '../src/run-agent.js'

describe('runAgent', () => {
	afterEach(() => {
		vi.clearAllMocks()
	})

	it('routes responses configs to the responses loop with resolved defaults', async () => {
		const client = { id: 'client' }
		createOpenAIClientMock.mockReturnValue(client)
		runResponsesLoopMock.mockResolvedValue({
			finalMessage: 'responses result',
			iterations: 1,
			flagCaptured: null,
		})

		const result = await runAgent(
			{
				openaiApiKey: 'sk',
				openaiModel: 'core-model',
				openaiTemperature: 0.2,
				aiDevsApiKey: 'devs',
				verifyEndpoint: 'https://verify',
				taskName: 'task',
			},
			{
				api: 'responses',
				tools: [],
				systemPrompt: 'system',
				userPrompt: 'user',
			}
		)

		expect(createOpenAIClientMock).toHaveBeenCalledWith({
			openaiApiKey: 'sk',
			openaiModel: 'core-model',
			openaiTemperature: 0.2,
			aiDevsApiKey: 'devs',
			verifyEndpoint: 'https://verify',
			taskName: 'task',
		})
		expect(runResponsesLoopMock).toHaveBeenCalledWith(
			client,
			'core-model',
			20,
			0.2,
			{
				api: 'responses',
				tools: [],
				systemPrompt: 'system',
				userPrompt: 'user',
			},
			undefined
		)
		expect(runCompletionsLoopMock).not.toHaveBeenCalled()
		expect(result).toEqual({
			finalMessage: 'responses result',
			iterations: 1,
			flagCaptured: null,
		})
	})

	it('routes completions configs to the completions loop with overrides', async () => {
		const client = { id: 'client' }
		createOpenAIClientMock.mockReturnValue(client)
		runCompletionsLoopMock.mockResolvedValue({
			finalMessage: 'completions result',
			iterations: 2,
			flagCaptured: '{FLG:test}',
		})

		const result = await runAgent(
			{
				openaiApiKey: 'sk',
				openaiModel: 'core-model',
				aiDevsApiKey: 'devs',
				verifyEndpoint: 'https://verify',
				taskName: 'task',
			},
			{
				api: 'completions',
				tools: [],
				systemPrompt: 'system',
				userPrompt: 'user',
				model: 'override-model',
				maxIterations: 7,
				temperature: 0.9,
			}
		)

		expect(runCompletionsLoopMock).toHaveBeenCalledWith(
			client,
			'override-model',
			7,
			0.9,
			{
				api: 'completions',
				tools: [],
				systemPrompt: 'system',
				userPrompt: 'user',
				model: 'override-model',
				maxIterations: 7,
				temperature: 0.9,
			},
			undefined
		)
		expect(runResponsesLoopMock).not.toHaveBeenCalled()
		expect(result).toEqual({
			finalMessage: 'completions result',
			iterations: 2,
			flagCaptured: '{FLG:test}',
		})
	})

	it('runs generic observability hooks around the selected loop', async () => {
		const client = { id: 'client' }
		const observability = {
			onRunStart: vi.fn().mockResolvedValue('run-handle'),
			onRunEnd: vi.fn(),
			flush: vi.fn(),
		}
		createOpenAIClientMock.mockReturnValue(client)
		runResponsesLoopMock.mockResolvedValue({
			finalMessage: 'responses result',
			iterations: 1,
			flagCaptured: null,
		})

		await runAgent(
			{
				openaiApiKey: 'sk',
				openaiModel: 'core-model',
				aiDevsApiKey: 'devs',
				verifyEndpoint: 'https://verify',
				taskName: 'task',
			},
			{
				api: 'responses',
				tools: [],
				systemPrompt: 'system',
				userPrompt: 'user',
				observability,
			}
		)

		expect(observability.onRunStart).toHaveBeenCalledWith({
			api: 'responses',
			taskName: 'task',
			model: 'core-model',
			maxIterations: 20,
			temperature: undefined,
			systemPrompt: 'system',
			userPrompt: 'user',
			toolNames: [],
		})
		expect(runResponsesLoopMock).toHaveBeenCalledWith(
			client,
			'core-model',
			20,
			undefined,
			expect.objectContaining({ observability }),
			'run-handle'
		)
		expect(observability.onRunEnd).toHaveBeenCalledWith({
			api: 'responses',
			runHandle: 'run-handle',
			result: {
				finalMessage: 'responses result',
				iterations: 1,
				flagCaptured: null,
			},
		})
		expect(observability.flush).toHaveBeenCalledTimes(1)
	})

	it('reports run errors to observability and rethrows', async () => {
		const client = { id: 'client' }
		const observability = {
			onRunStart: vi.fn().mockResolvedValue('run-handle'),
			onRunError: vi.fn(),
			flush: vi.fn(),
		}
		createOpenAIClientMock.mockReturnValue(client)
		runResponsesLoopMock.mockRejectedValue(new Error('loop failed'))

		await expect(
			runAgent(
				{
					openaiApiKey: 'sk',
					openaiModel: 'core-model',
					aiDevsApiKey: 'devs',
					verifyEndpoint: 'https://verify',
					taskName: 'task',
				},
				{
					api: 'responses',
					tools: [],
					systemPrompt: 'system',
					userPrompt: 'user',
					observability,
				}
			)
		).rejects.toThrow('loop failed')

		expect(observability.onRunError).toHaveBeenCalledWith({
			api: 'responses',
			runHandle: 'run-handle',
			errorMessage: 'loop failed',
		})
		expect(observability.flush).toHaveBeenCalledTimes(1)
	})

	it('executes the run through withRunContext when provided', async () => {
		const client = { id: 'client' }
		const withRunContext = vi.fn(async (_context, run) => run())
		createOpenAIClientMock.mockReturnValue(client)
		runResponsesLoopMock.mockResolvedValue({
			finalMessage: 'responses result',
			iterations: 1,
			flagCaptured: null,
		})

		await runAgent(
			{
				openaiApiKey: 'sk',
				openaiModel: 'core-model',
				aiDevsApiKey: 'devs',
				verifyEndpoint: 'https://verify',
				taskName: 'task',
			},
			{
				api: 'responses',
				tools: [],
				systemPrompt: 'system',
				userPrompt: 'user',
				observability: {
					withRunContext,
				},
			}
		)

		expect(withRunContext).toHaveBeenCalledWith(
			{
				api: 'responses',
				taskName: 'task',
				model: 'core-model',
				maxIterations: 20,
				temperature: undefined,
				systemPrompt: 'system',
				userPrompt: 'user',
				toolNames: [],
			},
			expect.any(Function)
		)
	})
})
