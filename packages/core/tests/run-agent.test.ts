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
		expect(runResponsesLoopMock).toHaveBeenCalledWith(client, 'core-model', 20, 0.2, {
			api: 'responses',
			tools: [],
			systemPrompt: 'system',
			userPrompt: 'user',
		})
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

		expect(runCompletionsLoopMock).toHaveBeenCalledWith(client, 'override-model', 7, 0.9, {
			api: 'completions',
			tools: [],
			systemPrompt: 'system',
			userPrompt: 'user',
			model: 'override-model',
			maxIterations: 7,
			temperature: 0.9,
		})
		expect(runResponsesLoopMock).not.toHaveBeenCalled()
		expect(result).toEqual({
			finalMessage: 'completions result',
			iterations: 2,
			flagCaptured: '{FLG:test}',
		})
	})
})
