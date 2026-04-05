import { afterEach, describe, expect, it, vi } from 'vitest'
import { createConfig, optionalEnv, requireEnv } from '../src/config.js'

describe('config helpers', () => {
	afterEach(() => {
		vi.unstubAllEnvs()
	})

	it('throws when a required env var is missing', () => {
		expect(() => requireEnv('UNIT_TEST_MISSING_ENV')).toThrow(
			'Missing required environment variable: UNIT_TEST_MISSING_ENV'
		)
	})

	it('returns the fallback for an optional env var', () => {
		expect(optionalEnv('UNIT_TEST_OPTIONAL_ENV', 'fallback')).toBe('fallback')
	})

	it('creates config from env values and overrides', () => {
		vi.stubEnv('OPENAI_API_KEY', 'openai-key')
		vi.stubEnv('AI_DEVS_API_KEY', 'ai-devs-key')
		vi.stubEnv('AI_DEVS_TASK_NAME', 'task-name')
		vi.stubEnv('AI_DEVS_HUB_ENDPOINT', 'https://hub.example')
		vi.stubEnv('OPENAI_MODEL', 'gpt-env')
		vi.stubEnv('OPENAI_TEMPERATURE', '0.25')
		vi.stubEnv('UNIT_TEST_REQUIRED_ENV', 'required-value')

		const config = createConfig({
			requiredEnv: {
				customValue: 'UNIT_TEST_REQUIRED_ENV',
			},
			optionalEnv: {
				region: { name: 'UNIT_TEST_OPTIONAL_REGION', fallback: 'eu' },
			},
			overrides: {
				openaiModel: 'override-model',
				taskName: 'override-task',
			},
		})

		expect(config).toMatchObject({
			openaiApiKey: 'openai-key',
			aiDevsApiKey: 'ai-devs-key',
			verifyEndpoint: 'https://hub.example/verify',
			openaiModel: 'override-model',
			openaiTemperature: 0.25,
			taskName: 'override-task',
			customValue: 'required-value',
			region: 'eu',
		})
	})
})
