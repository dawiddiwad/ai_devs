import { afterEach, describe, expect, it, vi } from 'vitest'
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
	afterEach(() => {
		vi.useRealTimers()
	})

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
			output: { text: 'final answer' },
			iterations: 1,
			flagCaptured: null,
		})
		expect(client.chatCompletionsCreate).toHaveBeenCalledTimes(1)
	})

	it('retries chat.completions.create on retryable OpenAI errors', async () => {
		vi.useFakeTimers()
		vi.spyOn(Math, 'random').mockReturnValue(0.5)

		const client = createClientMock()
		client.chatCompletionsCreate
			.mockRejectedValueOnce({ status: 503, message: 'Service unavailable', name: 'InternalServerError' })
			.mockResolvedValueOnce({
				choices: [
					{
						message: {
							role: 'assistant',
							content: 'final answer',
						},
					},
				],
			})

		const promise = runCompletionsLoop(client, 'model', 3, undefined, {
			api: 'completions',
			tools: [],
			systemPrompt: 'system',
			userPrompt: 'user',
		})

		await vi.runAllTimersAsync()

		await expect(promise).resolves.toEqual({
			output: { text: 'final answer' },
			iterations: 1,
			flagCaptured: null,
		})
		expect(client.chatCompletionsCreate).toHaveBeenCalledTimes(2)
	})

	it('requests native audio output and preserves previous audio ids across turns', async () => {
		const client = createClientMock()

		client.chatCompletionsCreate
			.mockResolvedValueOnce({
				choices: [
					{
						message: {
							role: 'assistant',
							content: 'spoken hello',
							audio: {
								id: 'audio-1',
								data: 'YmVlcA==',
								expires_at: 123,
								transcript: 'spoken hello',
							},
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
			tools: [],
			systemPrompt: 'system',
			userPrompt: 'user',
			output: {
				modalities: ['text', 'audio'],
				audio: { format: 'mp3', voice: 'alloy' },
			},
			handleNoToolCalls: ({ iterationIndex, messages }) => {
				if (iterationIndex === 0) {
					return { action: 'continue', messages: [...messages, { role: 'user', content: 'continue' }] }
				}

				return undefined
			},
		})

		expect(client.chatCompletionsCreate.mock.calls[0]?.[0]).toEqual(
			expect.objectContaining({
				modalities: ['text', 'audio'],
				audio: { format: 'mp3', voice: 'alloy' },
			})
		)
		expect(client.chatCompletionsCreate.mock.calls[1]?.[0]).toEqual(
			expect.objectContaining({
				messages: expect.arrayContaining([
					expect.objectContaining({
						role: 'assistant',
						content: 'spoken hello',
						audio: { id: 'audio-1' },
					}),
				]),
			})
		)
		expect(result).toEqual({
			output: { text: 'done' },
			iterations: 2,
			flagCaptured: null,
		})
	})

	it('forwards tool choice, reasoning effort, and service tier in completions requests', async () => {
		const client = createClientMock()
		const tool = createTool('lookup', 'ok')

		client.chatCompletionsCreate.mockResolvedValueOnce({
			choices: [
				{
					message: {
						role: 'assistant',
						content: 'done',
					},
				},
			],
		})

		await runCompletionsLoop(client, 'model', 3, 0.1, {
			api: 'completions',
			tools: [tool],
			systemPrompt: 'system',
			userPrompt: 'user',
			toolChoice: 'required',
			reasoning: { effort: 'low' },
			serviceTier: 'flex',
		})

		expect(client.chatCompletionsCreate).toHaveBeenCalledWith(
			expect.objectContaining({
				model: 'model',
				temperature: 0.1,
				tool_choice: 'required',
				reasoning_effort: 'low',
				service_tier: 'flex',
			})
		)
	})

	it('emits generic observability hooks for model, tool, and message lifecycle', async () => {
		const client = createClientMock()
		const tool = createTool('lookup', 'tool-result')
		const observability = {
			onModelStart: vi.fn().mockResolvedValueOnce('model-1').mockResolvedValueOnce('model-2'),
			onModelEnd: vi.fn(),
			onToolStart: vi.fn().mockResolvedValue('tool-1'),
			onToolEnd: vi.fn(),
			onOutput: vi.fn(),
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
		expect(observability.onOutput).toHaveBeenNthCalledWith(1, {
			api: 'completions',
			runHandle: 'run-handle',
			iterationIndex: 0,
			output: { text: 'need tool' },
			isFinal: false,
		})
		expect(observability.onOutput).toHaveBeenNthCalledWith(2, {
			api: 'completions',
			runHandle: 'run-handle',
			iterationIndex: 1,
			output: { text: 'done' },
			isFinal: false,
		})
	})

	it('applies handleOutput rewrites and onOutput callbacks', async () => {
		const client = createClientMock()
		const onOutput = vi.fn()

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
			handleOutput: ({ iterationIndex, output, messages }) => {
				if (iterationIndex === 0) {
					return {
						action: 'continue',
						output: { text: `rewritten ${output.text}` },
						messages: [...messages, { role: 'user', content: 'carry on' }],
					}
				}

				return { action: 'final', output: { text: `final ${output.text}` } }
			},
			handleNoToolCalls: ({ output }) => ({ action: 'final', output: { text: `final ${output.text}` } }),
			onOutput,
		})

		expect(onOutput).toHaveBeenCalledWith({ text: 'rewritten raw step 1' })
		expect(client.chatCompletionsCreate.mock.calls[0][0]).toEqual(
			expect.objectContaining({
				messages: [
					expect.objectContaining({ role: 'system', content: 'system' }),
					expect.objectContaining({ role: 'user', content: 'user' }),
				],
			})
		)
		expect(result).toEqual({
			output: { text: 'final rewritten raw step 1' },
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
			output: { text: 'override-result' },
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
			handleNoToolCalls: ({ iterationIndex, output, messages }) => {
				if (iterationIndex === 0) {
					return {
						action: 'continue',
						output: { text: `retry ${output.text}` },
						messages: [...messages, { role: 'user', content: 'try again' }],
					}
				}

				return { action: 'final', output: { text: `done ${output.text}` } }
			},
		})

		expect(client.chatCompletionsCreate.mock.calls[1][0]).toEqual(
			expect.objectContaining({
				messages: expect.arrayContaining([expect.objectContaining({ role: 'user', content: 'try again' })]),
			})
		)
		expect(result).toEqual({
			output: { text: 'done raw step 2' },
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
		expect(result.output.text).toBe('done')
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
			output: { text: 'done {FLG:completions-123}' },
			iterations: 1,
			flagCaptured: '{FLG:completions-123}',
		})
	})
})
