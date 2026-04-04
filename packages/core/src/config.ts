import dotenv from 'dotenv'
import type {
	CoreConfig,
	CreateConfigOptionalEnv,
	CreateConfigOptions,
	CreateConfigRequiredEnv,
	CreateConfigResult,
} from './types.js'

export function requireEnv(name: string): string {
	const value = process.env[name]
	if (!value) {
		throw new Error(`Missing required environment variable: ${name}`)
	}
	return value
}

export function optionalEnv(name: string, fallback?: string): string | undefined {
	return process.env[name] || fallback
}

function hasOwnProperty(object: Record<string, unknown>, key: string): boolean {
	return Object.prototype.hasOwnProperty.call(object, key)
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === 'object'
}

function resolveOverride<T>(overrides: Record<string, unknown>, key: string, getFallback: () => T): T {
	if (hasOwnProperty(overrides, key)) {
		return overrides[key] as T
	}

	return getFallback()
}

function resolveOptionalEnvEntry(entry: string | { name: string; fallback?: string }): string | undefined {
	if (typeof entry === 'string') {
		return optionalEnv(entry)
	}

	return optionalEnv(entry.name, entry.fallback)
}

function isCreateConfigOptions(
	input:
		| Partial<CoreConfig>
		| CreateConfigOptions<Record<string, unknown>, CreateConfigRequiredEnv, CreateConfigOptionalEnv>
		| undefined
): input is CreateConfigOptions<Record<string, unknown>, CreateConfigRequiredEnv, CreateConfigOptionalEnv> {
	if (!isRecord(input)) {
		return false
	}

	return (
		!!input &&
		typeof input === 'object' &&
		(!hasOwnProperty(input, 'overrides') || input.overrides === undefined || isRecord(input.overrides)) &&
		(!hasOwnProperty(input, 'requiredEnv') || input.requiredEnv === undefined || isRecord(input.requiredEnv)) &&
		(!hasOwnProperty(input, 'optionalEnv') || input.optionalEnv === undefined || isRecord(input.optionalEnv)) &&
		(hasOwnProperty(input, 'overrides') ||
			hasOwnProperty(input, 'requiredEnv') ||
			hasOwnProperty(input, 'optionalEnv'))
	)
}

export function createConfig<Overrides extends Record<string, unknown> = Record<string, never>>(
	overrides?: Partial<CoreConfig> & Overrides
): CreateConfigResult<Overrides>
export function createConfig<
	Overrides extends Record<string, unknown> = Record<string, never>,
	RequiredEnv extends CreateConfigRequiredEnv = Record<string, never>,
	OptionalEnv extends CreateConfigOptionalEnv = Record<string, never>,
>(
	options: CreateConfigOptions<Overrides, RequiredEnv, OptionalEnv>
): CreateConfigResult<Overrides, RequiredEnv, OptionalEnv>
export function createConfig(
	input?:
		| Partial<CoreConfig>
		| CreateConfigOptions<Record<string, unknown>, CreateConfigRequiredEnv, CreateConfigOptionalEnv>
): CoreConfig & Record<string, unknown> {
	dotenv.config()

	const options = isCreateConfigOptions(input) ? input : { overrides: input }
	const overrides = (options.overrides ?? {}) as Record<string, unknown>

	const requiredEnvConfig = Object.fromEntries(
		Object.entries(options.requiredEnv ?? {}).map(([key, envName]) => [
			key,
			resolveOverride(overrides, key, () => requireEnv(envName)),
		])
	)

	const optionalEnvConfig = Object.fromEntries(
		Object.entries(options.optionalEnv ?? {}).map(([key, entry]) => [
			key,
			resolveOverride(overrides, key, () => resolveOptionalEnvEntry(entry)),
		])
	)

	return {
		openaiBaseUrl: resolveOverride(overrides, 'openaiBaseUrl', () => process.env['OPENAI_BASE_URL'] || undefined),
		openaiApiKey: resolveOverride(overrides, 'openaiApiKey', () => requireEnv('OPENAI_API_KEY')),
		openaiModel: resolveOverride(overrides, 'openaiModel', () => process.env['OPENAI_MODEL'] || 'gpt-5-mini'),
		openaiTemperature: resolveOverride(overrides, 'openaiTemperature', () => {
			return process.env['OPENAI_TEMPERATURE'] ? parseFloat(process.env['OPENAI_TEMPERATURE']) : undefined
		}),
		aiDevsApiKey: resolveOverride(overrides, 'aiDevsApiKey', () => requireEnv('AI_DEVS_API_KEY')),
		verifyEndpoint: resolveOverride(
			overrides,
			'verifyEndpoint',
			() => `${requireEnv('AI_DEVS_HUB_ENDPOINT')}/verify`
		),
		taskName: resolveOverride(overrides, 'taskName', () => requireEnv('AI_DEVS_TASK_NAME')),
		...requiredEnvConfig,
		...optionalEnvConfig,
		...overrides,
	}
}
