import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
	NodeSDKMock,
	LangfuseSpanProcessorMock,
	propagateAttributesMock,
	startActiveObservationMock,
	startObservationMock,
	processorForceFlushMock,
	sdkStartMock,
	createdObservations,
} = vi.hoisted(() => {
	const createdObservations: Array<{
		name: string
		observation: {
			update: ReturnType<typeof vi.fn>
			end: ReturnType<typeof vi.fn>
			otelSpan: { spanContext: ReturnType<typeof vi.fn> }
		}
	}> = []
	const processorForceFlushMock = vi.fn().mockResolvedValue(undefined)
	const sdkStartMock = vi.fn().mockResolvedValue(undefined)
	const NodeSDKMock = vi.fn().mockImplementation(function NodeSDKMockImplementation() {
		return { start: sdkStartMock }
	})
	const LangfuseSpanProcessorMock = vi.fn().mockImplementation(function LangfuseSpanProcessorMockImplementation() {
		return {
			forceFlush: processorForceFlushMock,
		}
	})
	const propagateAttributesMock = vi.fn(async (_params, fn: () => Promise<unknown>) => fn())
	const startActiveObservationMock = vi.fn(
		async (
			name: string,
			fn: (observation: (typeof createdObservations)[number]['observation']) => Promise<unknown>
		) => {
			const observation = {
				update: vi.fn(),
				end: vi.fn(),
				setTraceIO: vi.fn(),
				otelSpan: {
					spanContext: vi.fn().mockReturnValue(`${name}-context`),
				},
			}

			createdObservations.push({ name, observation })

			return fn(observation)
		}
	)
	const startObservationMock = vi.fn().mockImplementation((name: string) => {
		const observation = {
			update: vi.fn(),
			end: vi.fn(),
			otelSpan: {
				spanContext: vi.fn().mockReturnValue(`${name}-context`),
			},
		}

		createdObservations.push({ name, observation })

		return observation
	})

	return {
		NodeSDKMock,
		LangfuseSpanProcessorMock,
		propagateAttributesMock,
		startActiveObservationMock,
		startObservationMock,
		processorForceFlushMock,
		sdkStartMock,
		createdObservations,
	}
})

vi.mock('@opentelemetry/sdk-node', () => ({
	NodeSDK: NodeSDKMock,
}))

vi.mock('@langfuse/otel', () => ({
	LangfuseSpanProcessor: LangfuseSpanProcessorMock,
}))

vi.mock('@langfuse/tracing', () => ({
	propagateAttributes: propagateAttributesMock,
	startActiveObservation: startActiveObservationMock,
	startObservation: startObservationMock,
}))

describe('createLangfuseObservability', () => {
	beforeEach(() => {
		createdObservations.length = 0
		processorForceFlushMock.mockClear()
		sdkStartMock.mockClear()
		NodeSDKMock.mockClear()
		LangfuseSpanProcessorMock.mockClear()
		propagateAttributesMock.mockClear()
		startActiveObservationMock.mockClear()
		startObservationMock.mockClear()
		vi.resetModules()
	})

	it('creates Langfuse observations for run, model, tool, and message lifecycle', async () => {
		const { createLangfuseObservability } = await import('../src/langfuse-observability.js')
		const observability = createLangfuseObservability({
			publicKey: 'pk-lf',
			secretKey: 'sk-lf',
			baseUrl: 'https://langfuse.example',
			traceName: 'warehouse-agent',
			metadata: { task: 'warehouse' },
		})

		const result = await observability.withRunContext?.(
			{
				api: 'responses',
				taskName: 'foodwarehouse',
				model: 'gpt-test',
				maxIterations: 5,
				temperature: 0.2,
				systemPrompt: 'system',
				userPrompt: 'user',
				toolNames: ['lookup'],
			},
			async () => {
				const modelHandle = await observability.onModelStart?.({
					api: 'responses',
					runHandle: undefined,
					model: 'gpt-test',
					iterationIndex: 0,
					request: { model: 'gpt-test', input: [] },
				})
				await observability.onModelEnd?.({
					api: 'responses',
					runHandle: undefined,
					modelHandle,
					model: 'gpt-test',
					iterationIndex: 0,
					request: { model: 'gpt-test', input: [] },
					response: { output: [{ type: 'message' }] },
				})

				const toolHandle = await observability.onToolStart?.({
					api: 'responses',
					runHandle: undefined,
					iterationIndex: 0,
					name: 'lookup',
					args: { city: 'Paris' },
				})
				await observability.onToolEnd?.({
					api: 'responses',
					runHandle: undefined,
					toolHandle,
					iterationIndex: 0,
					name: 'lookup',
					args: { city: 'Paris' },
					result: 'tool-result',
				})

				await observability.onOutput?.({
					api: 'responses',
					runHandle: undefined,
					iterationIndex: 1,
					output: { text: 'done' },
					isFinal: true,
				})

				return {
					output: { text: 'done' },
					iterations: 2,
					flagCaptured: null,
				}
			}
		)

		expect(LangfuseSpanProcessorMock).toHaveBeenCalledWith({
			publicKey: 'pk-lf',
			secretKey: 'sk-lf',
			baseUrl: 'https://langfuse.example',
			environment: undefined,
			release: undefined,
		})
		expect(NodeSDKMock).toHaveBeenCalledTimes(1)
		expect(sdkStartMock).toHaveBeenCalledTimes(1)
		expect(startActiveObservationMock).toHaveBeenNthCalledWith(1, 'warehouse-agent', expect.any(Function), {
			asType: 'agent',
		})
		expect(propagateAttributesMock).toHaveBeenCalledWith(
			{
				traceName: 'warehouse-agent',
				metadata: {
					api: 'responses',
					model: 'gpt-test',
					maxIterations: '5',
					taskName: 'foodwarehouse',
					toolNames: 'lookup',
					temperature: '0.2',
					task: 'warehouse',
				},
			},
			expect.any(Function)
		)
		expect(createdObservations[0]?.observation.update).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({
				input: { systemPrompt: 'system', userPrompt: 'user' },
				metadata: expect.objectContaining({
					api: 'responses',
					model: 'gpt-test',
					maxIterations: 5,
					temperature: 0.2,
					taskName: 'foodwarehouse',
					toolNames: ['lookup'],
					custom: { task: 'warehouse' },
				}),
			})
		)
		expect(createdObservations[0]?.observation.setTraceIO).toHaveBeenNthCalledWith(1, {
			input: { systemPrompt: 'system', userPrompt: 'user' },
		})
		await observability.flush?.()

		expect(startObservationMock).toHaveBeenNthCalledWith(
			1,
			'openai.responses.create',
			expect.objectContaining({
				input: { model: 'gpt-test', input: [] },
				model: 'gpt-test',
				metadata: { api: 'responses', iterationIndex: 0 },
			}),
			expect.objectContaining({ asType: 'generation' })
		)
		expect(startObservationMock).toHaveBeenNthCalledWith(
			2,
			'tool:lookup',
			expect.objectContaining({
				input: { city: 'Paris' },
				metadata: { iterationIndex: 0, name: 'lookup' },
			}),
			expect.objectContaining({ asType: 'tool' })
		)
		expect(startObservationMock).toHaveBeenNthCalledWith(
			3,
			'agent-output',
			expect.objectContaining({
				output: { text: 'done' },
				metadata: { api: 'responses', iterationIndex: 1, isFinal: true },
			}),
			expect.objectContaining({ asType: 'event' })
		)

		expect(createdObservations[1]?.observation.update).toHaveBeenCalledWith({
			output: { output: [{ type: 'message' }] },
		})
		expect(createdObservations[1]?.observation.end).toHaveBeenCalledTimes(1)
		expect(createdObservations[2]?.observation.update).toHaveBeenCalledWith({ output: 'tool-result' })
		expect(createdObservations[2]?.observation.end).toHaveBeenCalledTimes(1)
		expect(createdObservations[0]?.observation.update).toHaveBeenNthCalledWith(2, {
			output: {
				output: { text: 'done' },
				iterations: 2,
				flagCaptured: null,
			},
		})
		expect(createdObservations[0]?.observation.setTraceIO).toHaveBeenNthCalledWith(2, {
			output: {
				output: { text: 'done' },
				iterations: 2,
				flagCaptured: null,
			},
		})
		expect(result).toEqual({
			output: { text: 'done' },
			iterations: 2,
			flagCaptured: null,
		})
		expect(processorForceFlushMock).toHaveBeenCalledTimes(1)
	})

	it('preserves full JPEG data URIs in sanitized model requests', async () => {
		const { createLangfuseObservability } = await import('../src/langfuse-observability.js')
		const observability = createLangfuseObservability({
			publicKey: 'pk-lf',
			secretKey: 'sk-lf',
		})
		const imageUrl = `data:image/jpeg;base64,${'A'.repeat(5000)}`

		await observability.onModelStart?.({
			api: 'responses',
			runHandle: undefined,
			model: 'gpt-test',
			iterationIndex: 0,
			request: {
				model: 'gpt-test',
				input: [
					{
						role: 'user',
						content: [{ type: 'input_image', image_url: imageUrl }],
					},
				],
			},
		})

		expect(startObservationMock).toHaveBeenCalledWith(
			'openai.responses.create',
			expect.objectContaining({
				input: {
					model: 'gpt-test',
					input: [
						{
							role: 'user',
							content: [{ type: 'input_image', image_url: imageUrl }],
						},
					],
				},
			}),
			expect.objectContaining({ asType: 'generation' })
		)
	})
})
