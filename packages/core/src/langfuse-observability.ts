import { logger } from './logger.js'
import { sanitizeForObservability, truncateString } from './observability.js'
import type {
	AgentMessageObservationContext,
	AgentResult,
	AgentModelEndContext,
	AgentModelErrorContext,
	AgentModelStartContext,
	AgentObservationHandle,
	AgentObservability,
	AgentRunStartContext,
	AgentToolEndContext,
	AgentToolErrorContext,
	AgentToolStartContext,
} from './types.js'

interface LangfuseObservationLike {
	update: (attributes: Record<string, unknown>, options?: Record<string, unknown>) => void
	end: () => void
	setTraceIO?: (attributes: { input?: unknown; output?: unknown }) => void
	otelSpan: {
		spanContext: () => unknown
	}
}

interface LangfuseRuntime {
	processor: {
		forceFlush: () => Promise<void>
	}
	propagateAttributes: <T>(params: Record<string, unknown>, fn: () => Promise<T>) => Promise<T>
	startActiveObservation: (
		name: string,
		fn: (observation: LangfuseObservationLike) => Promise<AgentResult>,
		options?: Record<string, unknown>
	) => Promise<AgentResult>
	startObservation: (
		name: string,
		attributes?: Record<string, unknown>,
		options?: Record<string, unknown>
	) => LangfuseObservationLike
}

export interface CreateLangfuseObservabilityOptions {
	publicKey: string
	secretKey: string
	baseUrl?: string
	environment?: string
	release?: string
	traceName?: string
	sessionId?: string
	userId?: string
	tags?: string[]
	metadata?: Record<string, unknown>
	maxStringLength?: number
}

let sharedRuntimePromise: Promise<LangfuseRuntime> | undefined
let sharedRuntimeConfigKey: string | undefined

function createRuntimeConfigKey(options: CreateLangfuseObservabilityOptions): string {
	return JSON.stringify({
		publicKey: options.publicKey,
		baseUrl: options.baseUrl,
		environment: options.environment,
		release: options.release,
	})
}

async function createLangfuseRuntime(options: CreateLangfuseObservabilityOptions): Promise<LangfuseRuntime> {
	const [{ NodeSDK }, { LangfuseSpanProcessor }, { propagateAttributes, startActiveObservation, startObservation }] =
		await Promise.all([import('@opentelemetry/sdk-node'), import('@langfuse/otel'), import('@langfuse/tracing')])

	const processor = new LangfuseSpanProcessor({
		publicKey: options.publicKey,
		secretKey: options.secretKey,
		baseUrl: options.baseUrl,
		environment: options.environment,
		release: options.release,
	})

	const sdk = new NodeSDK({
		spanProcessors: [processor],
	})

	await sdk.start()

	return {
		processor,
		propagateAttributes,
		startActiveObservation,
		startObservation,
	}
}

async function getLangfuseRuntime(options: CreateLangfuseObservabilityOptions): Promise<LangfuseRuntime> {
	const configKey = createRuntimeConfigKey(options)

	if (!sharedRuntimePromise) {
		sharedRuntimeConfigKey = configKey
		sharedRuntimePromise = createLangfuseRuntime(options)
		return sharedRuntimePromise
	}

	if (sharedRuntimeConfigKey !== configKey) {
		logger.agent(
			'warn',
			'Langfuse runtime already initialized with different configuration; reusing existing runtime'
		)
	}

	return sharedRuntimePromise
}

function isLangfuseObservationHandle(handle: AgentObservationHandle | undefined): handle is LangfuseObservationLike {
	if (!handle || typeof handle !== 'object') {
		return false
	}

	const candidate = handle as Partial<LangfuseObservationLike>

	return (
		typeof candidate.update === 'function' &&
		typeof candidate.end === 'function' &&
		!!candidate.otelSpan &&
		typeof candidate.otelSpan.spanContext === 'function'
	)
}

function getParentSpanContext(handle: AgentObservationHandle | undefined): unknown {
	return isLangfuseObservationHandle(handle) ? handle.otelSpan.spanContext() : undefined
}

function createSanitizer(options: CreateLangfuseObservabilityOptions) {
	const maxStringLength = options.maxStringLength ?? 4000

	return (value: unknown) => sanitizeForObservability(value, maxStringLength)
}

function createErrorUpdate(errorMessage: string): Record<string, unknown> {
	return {
		level: 'ERROR',
		statusMessage: errorMessage,
		output: { error: errorMessage },
	}
}

function createRunMetadata(
	options: CreateLangfuseObservabilityOptions,
	context: AgentRunStartContext,
	sanitize: (value: unknown) => unknown
): Record<string, unknown> {
	return {
		api: context.api,
		model: context.model,
		maxIterations: context.maxIterations,
		temperature: context.temperature,
		taskName: context.taskName,
		toolNames: context.toolNames,
		...(options.metadata ? { custom: sanitize(options.metadata) } : {}),
	}
}

function createTraceInput(context: AgentRunStartContext, sanitize: (value: unknown) => unknown): unknown {
	return sanitize({
		systemPrompt: context.systemPrompt,
		userPrompt: context.userPrompt,
	})
}

function stringifyMetadataValue(value: unknown): string {
	if (typeof value === 'string') {
		return truncateString(value, 200)
	}

	return truncateString(JSON.stringify(sanitizeForObservability(value, 200, 3)), 200)
}

function createTracePropagationAttributes(
	options: CreateLangfuseObservabilityOptions,
	context: AgentRunStartContext
): Record<string, unknown> {
	const metadataEntries = {
		api: context.api,
		model: context.model,
		maxIterations: String(context.maxIterations),
		taskName: context.taskName,
		toolNames: context.toolNames.join(', '),
		...(context.temperature !== undefined ? { temperature: String(context.temperature) } : {}),
		...Object.fromEntries(
			Object.entries(options.metadata ?? {}).map(([key, value]) => [key, stringifyMetadataValue(value)])
		),
	}

	return {
		...(options.traceName ? { traceName: options.traceName } : {}),
		metadata: metadataEntries,
		...(options.sessionId ? { sessionId: options.sessionId } : {}),
		...(options.userId ? { userId: options.userId } : {}),
		...(options.tags ? { tags: options.tags } : {}),
		...(options.release ? { version: options.release } : {}),
	}
}

function updateAndEndObservation(
	handle: AgentObservationHandle | undefined,
	attributes: Record<string, unknown>
): void {
	if (!isLangfuseObservationHandle(handle)) {
		return
	}

	handle.update(attributes)
	handle.end()
}

export function createLangfuseObservability(options: CreateLangfuseObservabilityOptions): AgentObservability {
	const sanitize = createSanitizer(options)
	const traceName = options.traceName ?? 'agent-run'

	return {
		withRunContext: async (context: AgentRunStartContext, run: () => Promise<AgentResult>) => {
			try {
				const runtime = await getLangfuseRuntime(options)

				return runtime.startActiveObservation(
					traceName,
					async (agent) => {
						const traceInput = createTraceInput(context, sanitize)

						agent.update({
							input: traceInput,
							metadata: createRunMetadata(options, context, sanitize),
						})
						agent.setTraceIO?.({ input: traceInput })

						return runtime.propagateAttributes(
							createTracePropagationAttributes(options, context),
							async () => {
								try {
									const result = await run()
									const traceOutput = sanitize({
										finalMessage: result.finalMessage,
										iterations: result.iterations,
										flagCaptured: result.flagCaptured,
									})

									agent.update({ output: traceOutput })
									agent.setTraceIO?.({ output: traceOutput })

									return result
								} catch (error) {
									const errorMessage = error instanceof Error ? error.message : String(error)

									agent.update(createErrorUpdate(errorMessage))
									agent.setTraceIO?.({ output: { error: errorMessage } })
									throw error
								}
							}
						)
					},
					{ asType: 'agent' }
				)
			} catch (error) {
				logger.agent('warn', 'Langfuse run wrapper failed; falling back to plain execution', {
					error: error instanceof Error ? error.message : String(error),
				})
				return run()
			}
		},
		onModelStart: async ({ runHandle, api, model, iterationIndex, request }: AgentModelStartContext) => {
			const runtime = await getLangfuseRuntime(options)

			return runtime.startObservation(
				api === 'responses' ? 'openai.responses.create' : 'openai.chat.completions.create',
				{
					input: sanitize(request),
					model,
					metadata: {
						api,
						iterationIndex,
					},
				},
				{
					asType: 'generation',
					parentSpanContext: getParentSpanContext(runHandle),
				}
			)
		},
		onModelEnd: async ({ modelHandle, response }: AgentModelEndContext) => {
			updateAndEndObservation(modelHandle, {
				output: sanitize(response),
			})
		},
		onModelError: async ({ modelHandle, errorMessage }: AgentModelErrorContext) => {
			updateAndEndObservation(modelHandle, createErrorUpdate(errorMessage))
		},
		onToolStart: async ({ runHandle, iterationIndex, name, args }: AgentToolStartContext) => {
			const runtime = await getLangfuseRuntime(options)

			return runtime.startObservation(
				`tool:${name}`,
				{
					input: sanitize(args),
					metadata: {
						iterationIndex,
						name,
					},
				},
				{
					asType: 'tool',
					parentSpanContext: getParentSpanContext(runHandle),
				}
			)
		},
		onToolEnd: async ({ toolHandle, result }: AgentToolEndContext) => {
			updateAndEndObservation(toolHandle, {
				output: sanitize(result),
			})
		},
		onToolError: async ({ toolHandle, errorMessage }: AgentToolErrorContext) => {
			updateAndEndObservation(toolHandle, createErrorUpdate(errorMessage))
		},
		onMessage: async ({ runHandle, api, iterationIndex, content, isFinal }: AgentMessageObservationContext) => {
			const runtime = await getLangfuseRuntime(options)

			runtime.startObservation(
				'agent-message',
				{
					output: sanitize(content),
					metadata: {
						api,
						iterationIndex,
						isFinal,
					},
				},
				{
					asType: 'event',
					parentSpanContext: getParentSpanContext(runHandle),
				}
			)
		},
		flush: async () => {
			const runtime = await getLangfuseRuntime(options)
			await runtime.processor.forceFlush()
		},
	}
}
