import { describe, expect, it, vi } from 'vitest'
import type { AgentTool } from '../src/index.js'
import { runCompletionsLoop } from '../src/completions-loop.js'

function createClientMock() {
	const chatCompletionsCreate = vi.fn()

	return {
		chat: {
			completions: {
				create: chatCompletionsCreate,
			},
		},
		chatCompletionsCreate,
	} as unknown as Parameters<typeof runCompletionsLoop>[0] & {
		chatCompletionsCreate: typeof chatCompletionsCreate
	}
}

function createTool(name: string, result: string): AgentTool {
	return {
		definition: {
			type: 'function',
			name,
			description: 'test tool',
			parameters: {
				type: 'object',
				properties: {},
			},
			strict: true,
		},
		execute: vi.fn().mockResolvedValue(result),
	}
}

describe('runCompletionsLoop', () => {
	it('returns the final message when there are no tool calls', async () => {
		const client = createClientMock()
		client.chatCompletionsCreate.mockResolvedValueOnce({
			choices: [
				{
					message: {
						role: 'assistant',
						content: 'final answer',
					},
				},
			],
		})

		const result = await runCompletionsLoop(client, 'model', 3, undefined, {
			api: 'completions',
			tools: [],
			systemPrompt: 'system',
			userPrompt: 'user',
		})

		expect(result).toEqual({
			finalMessage: 'final answer',
			iterations: 1,
			flagCaptured: null,
		})
		expect(client.chatCompletionsCreate).toHaveBeenCalledTimes(1)
	})

	it('applies handleMessage rewrites and onMessage callbacks', async () => {
		const client = createClientMock()
		const onMessage = vi.fn()

		client.chatCompletionsCreate.mockResolvedValueOnce({
			choices: [
				{
					message: {
						role: 'assistant',
						content: 'raw step 1',
					},
				},
			],
		})

		const result = await runCompletionsLoop(client, 'model', 3, undefined, {
			api: 'completions',
			tools: [],
			systemPrompt: 'system',
			userPrompt: 'user',
			handleMessage: ({ iterationIndex, content, messages }) => {
				if (iterationIndex === 0) {
					return {
						action: 'continue',
						content: `rewritten ${content}`,
						messages: [...messages, { role: 'user', content: 'carry on' }],
					}
				}

				return { action: 'final', content: `final ${content}` }
			},
			handleNoToolCalls: ({ content }) => ({ action: 'final', content: `final ${content}` }),
			onMessage,
		})

		expect(onMessage).toHaveBeenCalledWith('rewritten raw step 1')
		expect(client.chatCompletionsCreate.mock.calls[0][0]).toEqual(
			expect.objectContaining({
				messages: [
					expect.objectContaining({ role: 'system', content: 'system' }),
					expect.objectContaining({ role: 'user', content: 'user' }),
				],
			})
		)
		expect(result).toEqual({
			finalMessage: 'final rewritten raw step 1',
			iterations: 1,
			flagCaptured: null,
		})
	})

	it('applies handleToolCall overrides and onToolCall callbacks', async () => {
		const client = createClientMock()
		const tool = createTool('lookup', 'default-result')
		const toolExecute = tool.execute as ReturnType<typeof vi.fn>
		const onToolCall = vi.fn()

		client.chatCompletionsCreate
			.mockResolvedValueOnce({
				choices: [
					{
						message: {
							role: 'assistant',
							content: 'need tool',
							tool_calls: [
								{
									id: 'call-1',
									type: 'function',
									function: {
										name: 'lookup',
										arguments: '{"city":"Paris"}',
									},
								},
							],
						},
					},
				],
			})
			.mockResolvedValueOnce({
				choices: [
					{
						message: {
							role: 'assistant',
							content: 'done',
							tool_calls: [
								{
									id: 'call-2',
									type: 'function',
									function: {
										name: 'lookup',
										arguments: '{"city":"Rome"}',
									},
								},
							],
						},
					},
				],
			})

		const result = await runCompletionsLoop(client, 'model', 3, undefined, {
			api: 'completions',
			tools: [tool],
			systemPrompt: 'system',
			userPrompt: 'user',
			handleToolCall: ({ iterationIndex, messages }) => {
				if (iterationIndex === 0) {
					return {
						action: 'continue',
						messages: [...messages, { role: 'assistant', content: 'post tool 1' }],
					}
				}

				return {
					action: 'final',
					result: 'override-result',
					messages: [...messages, { role: 'assistant', content: 'post tool 2' }],
				}
			},
			onToolCall,
		})

		expect(toolExecute).toHaveBeenCalledTimes(1)
		expect(onToolCall).toHaveBeenNthCalledWith(1, 'lookup', { city: 'Paris' }, 'default-result')
		expect(onToolCall).toHaveBeenNthCalledWith(2, 'lookup', { city: 'Rome' }, 'override-result')
		expect(client.chatCompletionsCreate.mock.calls[1][0]).toEqual(
			expect.objectContaining({
				messages: expect.arrayContaining([
					expect.objectContaining({ role: 'assistant', content: 'post tool 1' }),
				]),
			})
		)
		expect(result).toEqual({
			finalMessage: 'override-result',
			iterations: 2,
			flagCaptured: null,
		})
	})

	it('continues and then finalizes through handleNoToolCalls', async () => {
		const client = createClientMock()

		client.chatCompletionsCreate
			.mockResolvedValueOnce({
				choices: [
					{
						message: {
							role: 'assistant',
							content: 'raw step 1',
						},
					},
				],
			})
			.mockResolvedValueOnce({
				choices: [
					{
						message: {
							role: 'assistant',
							content: 'raw step 2',
						},
					},
				],
			})

		const result = await runCompletionsLoop(client, 'model', 3, undefined, {
			api: 'completions',
			tools: [],
			systemPrompt: 'system',
			userPrompt: 'user',
			handleNoToolCalls: ({ iterationIndex, content, messages }) => {
				if (iterationIndex === 0) {
					return {
						action: 'continue',
						content: `retry ${content}`,
						messages: [...messages, { role: 'user', content: 'try again' }],
					}
				}

				return { action: 'final', content: `done ${content}` }
			},
		})

		expect(client.chatCompletionsCreate.mock.calls[1][0]).toEqual(
			expect.objectContaining({
				messages: expect.arrayContaining([expect.objectContaining({ role: 'user', content: 'try again' })]),
			})
		)
		expect(result).toEqual({
			finalMessage: 'done raw step 2',
			iterations: 2,
			flagCaptured: null,
		})
	})

	it('throws when handleNoToolCalls continues without messages', async () => {
		const client = createClientMock()

		client.chatCompletionsCreate.mockResolvedValueOnce({
			choices: [
				{
					message: {
						role: 'assistant',
						content: 'raw step 1',
					},
				},
			],
		})

		await expect(
			runCompletionsLoop(client, 'model', 3, undefined, {
				api: 'completions',
				tools: [],
				systemPrompt: 'system',
				userPrompt: 'user',
				handleNoToolCalls: () => ({ action: 'continue' }) as never,
			})
		).rejects.toThrow('handleNoToolCalls must return messages when action is continue for the completions API')
	})

	it('runs a tool call and appends the tool result', async () => {
		const client = createClientMock()
		const tool = createTool('lookup', 'tool-result')
		const toolExecute = tool.execute as ReturnType<typeof vi.fn>

		client.chatCompletionsCreate
			.mockResolvedValueOnce({
				choices: [
					{
						message: {
							role: 'assistant',
							content: 'need tool',
							tool_calls: [
								{
									id: 'call-1',
									type: 'function',
									function: {
										name: 'lookup',
										arguments: '{"city":"Paris"}',
									},
								},
							],
						},
					},
				],
			})
			.mockResolvedValueOnce({
				choices: [
					{
						message: {
							role: 'assistant',
							content: 'done',
						},
					},
				],
			})

		const result = await runCompletionsLoop(client, 'model', 3, undefined, {
			api: 'completions',
			tools: [tool],
			systemPrompt: 'system',
			userPrompt: 'user',
		})

		expect(toolExecute).toHaveBeenCalledWith({ city: 'Paris' })
		expect(client.chatCompletionsCreate).toHaveBeenCalledTimes(2)
		expect(client.chatCompletionsCreate.mock.calls[1][0]).toEqual(
			expect.objectContaining({
				messages: expect.arrayContaining([
					expect.objectContaining({ role: 'tool', tool_call_id: 'call-1', content: 'tool-result' }),
				]),
			})
		)
		expect(result.finalMessage).toBe('done')
	})

	it('exits when a flag is captured', async () => {
		const client = createClientMock()
		const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never)

		client.chatCompletionsCreate.mockResolvedValueOnce({
			choices: [
				{
					message: {
						role: 'assistant',
						content: 'done {FLG:completions-123}',
					},
				},
			],
		})

		const result = await runCompletionsLoop(client, 'model', 3, undefined, {
			api: 'completions',
			tools: [],
			systemPrompt: 'system',
			userPrompt: 'user',
		})

		expect(exitSpy).toHaveBeenCalledWith(0)
		expect(result).toEqual({
			finalMessage: 'done {FLG:completions-123}',
			iterations: 1,
			flagCaptured: '{FLG:completions-123}',
		})
	})
})
