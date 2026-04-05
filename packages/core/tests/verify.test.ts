import { afterEach, describe, expect, it, vi } from 'vitest'
import { captureFlag, verifyAnswer } from '../src/verify.js'
import { CoreConfig } from '../src/types.js'

const { postMock } = vi.hoisted(() => ({
	postMock: vi.fn(),
}))

vi.mock('axios', () => ({
	default: {
		post: postMock,
	},
}))

const config = {
	openaiApiKey: 'openai-key',
	aiDevsApiKey: 'ai-devs-key',
	verifyEndpoint: 'https://hub.example/verify',
	taskName: 'task-name',
	openaiModel: 'model-name',
} satisfies CoreConfig

describe('verify helpers', () => {
	afterEach(() => {
		vi.restoreAllMocks()
		postMock.mockReset()
	})

	it('captures a flag from text', () => {
		expect(captureFlag('ok {FLG:abc123} done')).toBe('{FLG:abc123}')
		expect(captureFlag('no flag here')).toBeNull()
	})

	it('submits the expected payload and returns the response', async () => {
		postMock.mockResolvedValueOnce({ data: { ok: true, message: 'done' } })

		const result = await verifyAnswer(config, { answer: 'value' }, { exitOnFlag: false })

		expect(postMock).toHaveBeenCalledWith(
			config.verifyEndpoint,
			{
				task: config.taskName,
				apikey: config.aiDevsApiKey,
				answer: { answer: 'value' },
			},
			expect.objectContaining({ validateStatus: expect.any(Function) })
		)
		expect(result.responseText).toBe('{"ok":true,"message":"done"}')
		expect(result.flag).toBeNull()
	})

	it('exits when a flag is returned', async () => {
		postMock.mockResolvedValueOnce({ data: 'all good {FLG:verify-123}' })
		const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never)

		const result = await verifyAnswer(config, 'answer')

		expect(exitSpy).toHaveBeenCalledWith(0)
		expect(result.flag).toBe('{FLG:verify-123}')
		expect(result.responseText).toBe('all good {FLG:verify-123}')
	})
})
