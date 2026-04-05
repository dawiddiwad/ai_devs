import { afterEach, beforeEach, vi } from 'vitest'

vi.mock('dotenv', () => ({
	default: {
		config: vi.fn(),
	},
}))

const consoleMethods = ['info', 'warn', 'error', 'debug'] as const

beforeEach(() => {
	for (const method of consoleMethods) {
		vi.spyOn(console, method).mockImplementation(() => undefined)
	}
})

afterEach(() => {
	vi.restoreAllMocks()
})
