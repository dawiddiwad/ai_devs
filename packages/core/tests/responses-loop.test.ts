import { describe, expect, it, vi } from 'vitest'
import type { AgentTool } from '../src/index.js'
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
			finalMessage: 'final answer',
			iterations: 1,
			flagCaptured: null,
		})
		expect(client.conversationsCreate).toHaveBeenCalledTimes(1)
		expect(client.responsesCreate).toHaveBeenCalledTimes(1)
	})

	it('applies handleMessage rewrites and onMessage callbacks', async () => {
		const client = createClientMock()
		const onMessage = vi.fn()

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
			handleMessage: ({ iterationIndex, content, input }) => {
				if (iterationIndex === 0) {
					return {
						action: 'continue',
						content: `rewritten ${content}`,
						input: [...input, { role: 'user', content: 'carry on' }],
					}
				}

				return { action: 'final', content: `final ${content}` }
			},
			onMessage,
		})

		expect(onMessage).toHaveBeenNthCalledWith(1, 'rewritten raw step 1')
		expect(onMessage).toHaveBeenNthCalledWith(2, 'final raw step 2')
		expect(client.responsesCreate.mock.calls[1][0]).toEqual(
			expect.objectContaining({
				input: [expect.objectContaining({ role: 'user', content: 'carry on' })],
			})
		)
		expect(result).toEqual({
			finalMessage: 'final raw step 2',
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
			finalMessage: 'override-result',
			iterations: 2,
			flagCaptured: null,
		})
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
			handleNoToolCalls: ({ iterationIndex, content, input }) => {
				if (iterationIndex === 0) {
					return {
						action: 'continue',
						content: `retry ${content}`,
						input: [...input, { role: 'user', content: 'try again' }],
					}
				}

				return { action: 'final', content: `done ${content}` }
			},
		})

		expect(client.responsesCreate.mock.calls[1][0]).toEqual(
			expect.objectContaining({
				input: [expect.objectContaining({ role: 'user', content: 'try again' })],
			})
		)
		expect(result).toEqual({
			finalMessage: 'done raw step 2',
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
		expect(result.finalMessage).toBe('done')
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
			finalMessage: 'done {FLG:responses-123}',
			iterations: 1,
			flagCaptured: '{FLG:responses-123}',
		})
	})
})
