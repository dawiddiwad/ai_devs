import { describe, expect, it, vi } from 'vitest'
import type { AgentTool, AgentToolResult } from '../src/index.js'
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

function createTool(name: string, result: AgentToolResult): AgentTool {
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

	it('emits generic observability hooks for model, tool, and message lifecycle', async () => {
		const client = createClientMock()
		const tool = createTool('lookup', 'tool-result')
		const observability = {
			onModelStart: vi.fn().mockResolvedValueOnce('model-1').mockResolvedValueOnce('model-2'),
			onModelEnd: vi.fn(),
			onToolStart: vi.fn().mockResolvedValue('tool-1'),
			onToolEnd: vi.fn(),
			onMessage: vi.fn(),
		}

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

		await runCompletionsLoop(
			client,
			'model',
			3,
			undefined,
			{
				api: 'completions',
				tools: [tool],
				systemPrompt: 'system',
				userPrompt: 'user',
				observability,
			},
			'run-handle'
		)

		expect(observability.onModelStart).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({
				api: 'completions',
				runHandle: 'run-handle',
				model: 'model',
				iterationIndex: 0,
			})
		)
		expect(observability.onModelEnd).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({
				api: 'completions',
				runHandle: 'run-handle',
				modelHandle: 'model-1',
				iterationIndex: 0,
			})
		)
		expect(observability.onToolStart).toHaveBeenCalledWith({
			api: 'completions',
			runHandle: 'run-handle',
			iterationIndex: 0,
			name: 'lookup',
			args: '{"city":"Paris"}',
		})
		expect(observability.onToolEnd).toHaveBeenCalledWith({
			api: 'completions',
			runHandle: 'run-handle',
			toolHandle: 'tool-1',
			iterationIndex: 0,
			name: 'lookup',
			args: { city: 'Paris' },
			result: 'tool-result',
		})
		expect(observability.onMessage).toHaveBeenNthCalledWith(1, {
			api: 'completions',
			runHandle: 'run-handle',
			iterationIndex: 0,
			content: 'need tool',
			isFinal: false,
		})
		expect(observability.onMessage).toHaveBeenNthCalledWith(2, {
			api: 'completions',
			runHandle: 'run-handle',
			iterationIndex: 1,
			content: 'done',
			isFinal: false,
		})
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

	it('adds multimodal follow-up content for binary tool results in completions', async () => {
		const client = createClientMock()
		const tool = createTool('inspect_screenshot', {
			type: 'image',
			base64: 'ZmFrZS1pbWFnZQ==',
			mimeType: 'image/png',
			detail: 'high',
			text: 'Check the red warning badge in the header.',
		})

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
										name: 'inspect_screenshot',
										arguments: '{}',
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

		await runCompletionsLoop(client, 'model', 3, undefined, {
			api: 'completions',
			tools: [tool],
			systemPrompt: 'system',
			userPrompt: 'user',
		})

		expect(client.chatCompletionsCreate.mock.calls[1]?.[0]).toEqual(
			expect.objectContaining({
				messages: expect.arrayContaining([
					expect.objectContaining({
						role: 'tool',
						tool_call_id: 'call-1',
						content: 'Check the red warning badge in the header.',
					}),
					{
						role: 'user',
						content: [
							{
								type: 'text',
								text: 'Tool "inspect_screenshot" returned the attached image. Use it as the tool result for call "call-1". Tool note: Check the red warning badge in the header.',
							},
							{
								type: 'image_url',
								image_url: {
									url: 'data:image/png;base64,ZmFrZS1pbWFnZQ==',
									detail: 'high',
								},
							},
						],
					},
				]),
			})
		)
	})

	it('adds audio follow-up content for audio tool results in completions', async () => {
		const client = createClientMock()
		const tool = createTool('listen_note', {
			type: 'audio',
			base64: 'c291bmQ=',
			format: 'wav',
			transcript: 'The customer says the package arrived damaged.',
		})

		client.chatCompletionsCreate
			.mockResolvedValueOnce({
				choices: [
					{
						message: {
							role: 'assistant',
							content: 'need audio tool',
							tool_calls: [
								{
									id: 'call-audio-1',
									type: 'function',
									function: {
										name: 'listen_note',
										arguments: '{}',
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

		await runCompletionsLoop(client, 'model', 3, undefined, {
			api: 'completions',
			tools: [tool],
			systemPrompt: 'system',
			userPrompt: 'user',
		})

		expect(client.chatCompletionsCreate.mock.calls[1]?.[0]).toEqual(
			expect.objectContaining({
				messages: expect.arrayContaining([
					expect.objectContaining({
						role: 'tool',
						tool_call_id: 'call-audio-1',
						content: 'The customer says the package arrived damaged.',
					}),
					{
						role: 'user',
						content: [
							{
								type: 'text',
								text: 'Tool "listen_note" returned the attached audio. Use it as the tool result for call "call-audio-1". Transcript: The customer says the package arrived damaged.',
							},
							{
								type: 'input_audio',
								input_audio: {
									data: 'c291bmQ=',
									format: 'wav',
								},
							},
						],
					},
				]),
			})
		)
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
