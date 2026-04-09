import { afterEach, describe, expect, it, vi } from 'vitest'
import { calculateRetryDelayMs, isRetryableOpenAIError, withOpenAIRetry } from '../src/openai-retry.js'

describe('openai-retry', () => {
	afterEach(() => {
		vi.useRealTimers()
	})

	it('classifies retryable and non-retryable OpenAI errors', () => {
		expect(isRetryableOpenAIError({ status: 429, message: 'Rate limit exceeded', name: 'RateLimitError' })).toBe(
			true
		)
		expect(
			isRetryableOpenAIError({ status: 429, message: 'Insufficient balance remaining', name: 'RateLimitError' })
		).toBe(false)
		expect(isRetryableOpenAIError({ status: 400, message: 'Bad request', name: 'BadRequestError' })).toBe(false)
		expect(isRetryableOpenAIError({ code: 'ECONNRESET', message: 'socket reset' })).toBe(true)
	})

	it('applies slight jitter around the configured base delay', () => {
		vi.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(0.5).mockReturnValueOnce(1)

		expect(calculateRetryDelayMs(1)).toBe(900)
		expect(calculateRetryDelayMs(1)).toBe(1000)
		expect(calculateRetryDelayMs(1)).toBe(1100)
	})

	it('retries retryable errors with exponential backoff until the request succeeds', async () => {
		vi.useFakeTimers()
		vi.spyOn(Math, 'random').mockReturnValue(0.5)

		const request = vi
			.fn<() => Promise<string>>()
			.mockRejectedValueOnce({ status: 429, message: 'Rate limit exceeded', name: 'RateLimitError' })
			.mockRejectedValueOnce({ status: 503, message: 'Service unavailable', name: 'InternalServerError' })
			.mockResolvedValue('ok')

		const promise = withOpenAIRetry('responses.create', request)

		await vi.runAllTimersAsync()

		await expect(promise).resolves.toBe('ok')
		expect(request).toHaveBeenCalledTimes(3)
	})

	it('throws immediately for non-retryable 429 credit errors', async () => {
		vi.useFakeTimers()
		vi.spyOn(Math, 'random').mockReturnValue(0.5)

		const error = { status: 429, message: 'Your credit balance is exhausted', name: 'RateLimitError' }
		const request = vi.fn<() => Promise<string>>().mockRejectedValue(error)

		const promise = withOpenAIRetry('responses.create', request)

		await expect(promise).rejects.toEqual(error)
		expect(request).toHaveBeenCalledTimes(1)
	})
})
