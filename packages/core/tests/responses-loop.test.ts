import { describe, expect, it, vi } from 'vitest'
import type { AgentTool, AgentToolResult } from '../src/index.js'
import { runResponsesLoop } from '../src/responses-loop.js'

function createClientMock() {
	const conversationsCreate = vi.fn().mockResolvedValue({ id: 'conversation-1' })
	const responsesCreate = vi.fn()

	return {
		conversations: {
			create: conversationsCreate,
		},
		responses: {
			create: responsesCreate,
		},
		conversationsCreate,
		responsesCreate,
	} as unknown as Parameters<typeof runResponsesLoop>[0] & {
		conversationsCreate: typeof conversationsCreate
		responsesCreate: typeof responsesCreate
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

describe('runResponsesLoop', () => {
	it('returns the final message when there are no tool calls', async () => {
		const client = createClientMock()
		client.responsesCreate.mockResolvedValueOnce({
			output: [
				{
					type: 'message',
					content: [{ type: 'output_text', text: 'final answer' }],
				},
			],
		})

		const result = await runResponsesLoop(client, 'model', 3, undefined, {
			api: 'responses',
			tools: [],
			systemPrompt: 'system',
			userPrompt: 'user',
		})

		expect(result).toEqual({
			output: { text: 'final answer' },
			iterations: 1,
			flagCaptured: null,
		})
		expect(client.conversationsCreate).toHaveBeenCalledTimes(1)
		expect(client.responsesCreate).toHaveBeenCalledTimes(1)
	})

	it('rejects direct native audio output requests in the responses loop', async () => {
		const client = createClientMock()

		await expect(
			runResponsesLoop(client, 'model', 3, undefined, {
				api: 'responses',
				tools: [],
				systemPrompt: 'system',
				userPrompt: 'user',
				output: {
					modalities: ['text', 'audio'],
					audio: { format: 'mp3', voice: 'alloy' },
				},
			})
		).rejects.toThrow(
			'Direct model audio output is not supported by the Responses loop yet. Use api: "completions" for native audio generation.'
		)
	})

	it('normalizes output_audio items when the provider returns them', async () => {
		const client = createClientMock()
		client.responsesCreate.mockResolvedValueOnce({
			output: [
				{
					type: 'message',
					content: [{ type: 'output_text', text: 'spoken hello' }],
				},
				{
					type: 'output_audio',
					data: 'YmVlcA==',
					transcript: 'spoken hello',
				},
			],
		})

		const result = await runResponsesLoop(client, 'model', 3, undefined, {
			api: 'responses',
			tools: [],
			systemPrompt: 'system',
			userPrompt: 'user',
		})

		expect(result).toEqual({
			output: {
				text: 'spoken hello',
				audio: {
					base64: 'YmVlcA==',
					format: 'mp3',
					transcript: 'spoken hello',
				},
			},
			iterations: 1,
			flagCaptured: null,
		})
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

		client.responsesCreate
			.mockResolvedValueOnce({
				output: [
					{
						type: 'function_call',
						call_id: 'call-1',
						name: 'lookup',
						arguments: '{"city":"Paris"}',
					},
				],
			})
			.mockResolvedValueOnce({
				output: [
					{
						type: 'message',
						content: [{ type: 'output_text', text: 'done' }],
					},
				],
			})

		await runResponsesLoop(
			client,
			'model',
			3,
			undefined,
			{
				api: 'responses',
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
				api: 'responses',
				runHandle: 'run-handle',
				model: 'model',
				iterationIndex: 0,
			})
		)
		expect(observability.onModelEnd).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({
				api: 'responses',
				runHandle: 'run-handle',
				modelHandle: 'model-1',
				iterationIndex: 0,
			})
		)
		expect(observability.onToolStart).toHaveBeenCalledWith({
			api: 'responses',
			runHandle: 'run-handle',
			iterationIndex: 0,
			name: 'lookup',
			args: '{"city":"Paris"}',
		})
		expect(observability.onToolEnd).toHaveBeenCalledWith({
			api: 'responses',
			runHandle: 'run-handle',
			toolHandle: 'tool-1',
			iterationIndex: 0,
			name: 'lookup',
			args: { city: 'Paris' },
			result: 'tool-result',
		})
		expect(observability.onOutput).toHaveBeenCalledWith({
			api: 'responses',
			runHandle: 'run-handle',
			iterationIndex: 1,
			output: { text: 'done' },
			isFinal: false,
		})
	})

	it('applies handleOutput rewrites and onOutput callbacks', async () => {
		const client = createClientMock()
		const onOutput = vi.fn()

		client.responsesCreate
			.mockResolvedValueOnce({
				output: [
					{
						type: 'message',
						content: [{ type: 'output_text', text: 'raw step 1' }],
					},
				],
			})
			.mockResolvedValueOnce({
				output: [
					{
						type: 'message',
						content: [{ type: 'output_text', text: 'raw step 2' }],
					},
				],
			})

		const result = await runResponsesLoop(client, 'model', 3, undefined, {
			api: 'responses',
			tools: [],
			systemPrompt: 'system',
			userPrompt: 'user',
			handleOutput: ({ iterationIndex, output, input }) => {
				if (iterationIndex === 0) {
					return {
						action: 'continue',
						output: { text: `rewritten ${output.text}` },
						input: [...input, { role: 'user', content: 'carry on' }],
					}
				}

				return { action: 'final', output: { text: `final ${output.text}` } }
			},
			onOutput,
		})

		expect(onOutput).toHaveBeenNthCalledWith(1, { text: 'rewritten raw step 1' })
		expect(onOutput).toHaveBeenNthCalledWith(2, { text: 'final raw step 2' })
		expect(client.responsesCreate.mock.calls[1][0]).toEqual(
			expect.objectContaining({
				input: [expect.objectContaining({ role: 'user', content: 'carry on' })],
			})
		)
		expect(result).toEqual({
			output: { text: 'final raw step 2' },
			iterations: 2,
			flagCaptured: null,
		})
	})

	it('applies handleToolCall overrides and onToolCall callbacks', async () => {
		const client = createClientMock()
		const tool = createTool('lookup', 'default-result')
		const toolExecute = tool.execute as ReturnType<typeof vi.fn>
		const onToolCall = vi.fn()

		client.responsesCreate
			.mockResolvedValueOnce({
				output: [
					{
						type: 'function_call',
						call_id: 'call-1',
						name: 'lookup',
						arguments: '{"city":"Paris"}',
					},
				],
			})
			.mockResolvedValueOnce({
				output: [
					{
						type: 'function_call',
						call_id: 'call-2',
						name: 'lookup',
						arguments: '{"city":"Rome"}',
					},
				],
			})

		const result = await runResponsesLoop(client, 'model', 3, undefined, {
			api: 'responses',
			tools: [tool],
			systemPrompt: 'system',
			userPrompt: 'user',
			handleToolCall: ({ iterationIndex, input }) => {
				if (iterationIndex === 0) {
					return {
						action: 'continue',
						input: [...input, { role: 'user', content: 'more context' }],
					}
				}

				return { action: 'final', result: 'override-result' }
			},
			onToolCall,
		})

		expect(toolExecute).toHaveBeenCalledTimes(1)
		expect(onToolCall).toHaveBeenNthCalledWith(1, 'lookup', { city: 'Paris' }, 'default-result')
		expect(onToolCall).toHaveBeenNthCalledWith(2, 'lookup', { city: 'Rome' }, 'override-result')
		expect(client.responsesCreate.mock.calls[1][0]).toEqual(
			expect.objectContaining({
				input: [expect.objectContaining({ role: 'user', content: 'more context' })],
			})
		)
		expect(result).toEqual({
			output: { text: 'override-result' },
			iterations: 2,
			flagCaptured: null,
		})
	})

	it('serializes binary file tool results for the responses API', async () => {
		const client = createClientMock()
		const tool = createTool('open_manual', {
			type: 'file',
			base64: 'ZmFrZS1wZGY=',
			mimeType: 'application/pdf',
			filename: 'manual.pdf',
			text: 'Read page 3 first.',
		})

		client.responsesCreate
			.mockResolvedValueOnce({
				output: [
					{
						type: 'function_call',
						call_id: 'call-1',
						name: 'open_manual',
						arguments: '{}',
					},
				],
			})
			.mockResolvedValueOnce({
				output: [
					{
						type: 'message',
						content: [{ type: 'output_text', text: 'done' }],
					},
				],
			})

		await runResponsesLoop(client, 'model', 3, undefined, {
			api: 'responses',
			tools: [tool],
			systemPrompt: 'system',
			userPrompt: 'user',
		})

		expect(client.responsesCreate.mock.calls[1]?.[0]).toEqual(
			expect.objectContaining({
				input: [
					{
						type: 'function_call_output',
						call_id: 'call-1',
						output: [
							{ type: 'input_text', text: 'Read page 3 first.' },
							{
								type: 'input_file',
								filename: 'manual.pdf',
								file_data: 'data:application/pdf;base64,ZmFrZS1wZGY=',
							},
						],
					},
				],
			})
		)
	})

	it('serializes audio tool results for the responses API via transcript plus input_audio shim', async () => {
		const client = createClientMock()
		const tool = createTool('listen_note', {
			type: 'audio',
			base64: 'c291bmQ=',
			format: 'wav',
			transcript: 'The note says to inspect shelf seven.',
		})

		client.responsesCreate
			.mockResolvedValueOnce({
				output: [
					{
						type: 'function_call',
						call_id: 'call-audio-1',
						name: 'listen_note',
						arguments: '{}',
					},
				],
			})
			.mockResolvedValueOnce({
				output: [
					{
						type: 'message',
						content: [{ type: 'output_text', text: 'done' }],
					},
				],
			})

		await runResponsesLoop(client, 'model', 3, undefined, {
			api: 'responses',
			tools: [tool],
			systemPrompt: 'system',
			userPrompt: 'user',
		})

		expect(client.responsesCreate.mock.calls[1]?.[0]).toEqual(
			expect.objectContaining({
				input: [
					{
						type: 'function_call_output',
						call_id: 'call-audio-1',
						output: 'The note says to inspect shelf seven.',
					},
					{
						type: 'input_audio',
						input_audio: {
							data: 'c291bmQ=',
							format: 'wav',
						},
					},
				],
			})
		)
	})

	it('continues and then finalizes through handleNoToolCalls', async () => {
		const client = createClientMock()

		client.responsesCreate
			.mockResolvedValueOnce({
				output: [
					{
						type: 'message',
						content: [{ type: 'output_text', text: 'raw step 1' }],
					},
				],
			})
			.mockResolvedValueOnce({
				output: [
					{
						type: 'message',
						content: [{ type: 'output_text', text: 'raw step 2' }],
					},
				],
			})

		const result = await runResponsesLoop(client, 'model', 3, undefined, {
			api: 'responses',
			tools: [],
			systemPrompt: 'system',
			userPrompt: 'user',
			handleNoToolCalls: ({ iterationIndex, output, input }) => {
				if (iterationIndex === 0) {
					return {
						action: 'continue',
						output: { text: `retry ${output.text}` },
						input: [...input, { role: 'user', content: 'try again' }],
					}
				}

				return { action: 'final', output: { text: `done ${output.text}` } }
			},
		})

		expect(client.responsesCreate.mock.calls[1][0]).toEqual(
			expect.objectContaining({
				input: [expect.objectContaining({ role: 'user', content: 'try again' })],
			})
		)
		expect(result).toEqual({
			output: { text: 'done raw step 2' },
			iterations: 2,
			flagCaptured: null,
		})
	})

	it('throws when handleNoToolCalls continues without input', async () => {
		const client = createClientMock()

		client.responsesCreate.mockResolvedValueOnce({
			output: [
				{
					type: 'message',
					content: [{ type: 'output_text', text: 'raw step 1' }],
				},
			],
		})

		await expect(
			runResponsesLoop(client, 'model', 3, undefined, {
				api: 'responses',
				tools: [],
				systemPrompt: 'system',
				userPrompt: 'user',
				handleNoToolCalls: () => ({ action: 'continue' }) as never,
			})
		).rejects.toThrow('handleNoToolCalls must return input when action is continue for the responses API')
	})

	it('runs a tool call and appends the tool result', async () => {
		const client = createClientMock()
		const tool = createTool('lookup', 'tool-result')
		const toolExecute = tool.execute as ReturnType<typeof vi.fn>

		client.responsesCreate
			.mockResolvedValueOnce({
				output: [
					{
						type: 'function_call',
						call_id: 'call-1',
						name: 'lookup',
						arguments: '{"city":"Paris"}',
					},
				],
			})
			.mockResolvedValueOnce({
				output: [
					{
						type: 'message',
						content: [{ type: 'output_text', text: 'done' }],
					},
				],
			})

		const result = await runResponsesLoop(client, 'model', 3, undefined, {
			api: 'responses',
			tools: [tool],
			systemPrompt: 'system',
			userPrompt: 'user',
		})

		expect(toolExecute).toHaveBeenCalledWith({ city: 'Paris' })
		expect(client.responsesCreate).toHaveBeenCalledTimes(2)
		expect(client.responsesCreate.mock.calls[1][0]).toEqual(
			expect.objectContaining({
				input: [
					{
						type: 'function_call_output',
						call_id: 'call-1',
						output: 'tool-result',
					},
				],
			})
		)
		expect(result.output.text).toBe('done')
	})

	it('exits when a flag is captured', async () => {
		const client = createClientMock()
		const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never)

		client.responsesCreate.mockResolvedValueOnce({
			output: [
				{
					type: 'message',
					content: [{ type: 'output_text', text: 'done {FLG:responses-123}' }],
				},
			],
		})

		const result = await runResponsesLoop(client, 'model', 3, undefined, {
			api: 'responses',
			tools: [],
			systemPrompt: 'system',
			userPrompt: 'user',
		})

		expect(exitSpy).toHaveBeenCalledWith(0)
		expect(result).toEqual({
			output: { text: 'done {FLG:responses-123}' },
			iterations: 1,
			flagCaptured: '{FLG:responses-123}',
		})
	})
})
