import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod/v4'
import { defineAgentTool } from '../src/tool-factory.js'

describe('defineAgentTool', () => {
	it('builds a function tool definition without the schema marker', () => {
		const tool = defineAgentTool({
			name: 'lookup_city',
			description: 'Looks up a city',
			schema: z.object({ city: z.string() }),
			handler: vi.fn().mockResolvedValue('ok'),
		})

		expect(tool.definition).toMatchObject({
			type: 'function',
			name: 'lookup_city',
			description: 'Looks up a city',
			strict: true,
		})
		expect(tool.definition.parameters).not.toHaveProperty('$schema')
	})

	it('passes parsed args to the handler', async () => {
		const handler = vi.fn().mockResolvedValue('handled')
		const tool = defineAgentTool({
			name: 'lookup_city',
			description: 'Looks up a city',
			schema: z.object({ city: z.string(), count: z.number() }),
			handler,
		})

		await expect(tool.execute({ city: 'Berlin', count: 2 })).resolves.toBe('handled')
		expect(handler).toHaveBeenCalledWith({ city: 'Berlin', count: 2 })
	})

	it('passes through binary tool results', async () => {
		const tool = defineAgentTool({
			name: 'render_map',
			description: 'Renders a map preview',
			schema: z.object({ city: z.string() }),
			handler: vi.fn().mockResolvedValue({
				type: 'image',
				base64: 'aGVsbG8=',
				mimeType: 'image/png',
				detail: 'high',
				text: 'Focus on the highlighted route.',
			}),
		})

		await expect(tool.execute({ city: 'Berlin' })).resolves.toEqual({
			type: 'image',
			base64: 'aGVsbG8=',
			mimeType: 'image/png',
			detail: 'high',
			text: 'Focus on the highlighted route.',
		})
	})

	it('passes through audio tool results', async () => {
		const tool = defineAgentTool({
			name: 'listen_note',
			description: 'Returns a spoken note',
			schema: z.object({ id: z.string() }),
			handler: vi.fn().mockResolvedValue({
				type: 'audio',
				base64: 'c291bmQ=',
				format: 'wav',
				transcript: 'Remember to inspect the damaged package.',
			}),
		})

		await expect(tool.execute({ id: '42' })).resolves.toEqual({
			type: 'audio',
			base64: 'c291bmQ=',
			format: 'wav',
			transcript: 'Remember to inspect the damaged package.',
		})
	})

	it('returns an error payload for invalid args', async () => {
		const tool = defineAgentTool({
			name: 'lookup_city',
			description: 'Looks up a city',
			schema: z.object({ city: z.string() }),
			handler: vi.fn(),
		})

		await expect(tool.execute({ city: 123 })).resolves.toMatch(/^\{"error":"Invalid args: /)
	})

	it('respects the strict override', () => {
		const tool = defineAgentTool({
			name: 'lookup_city',
			description: 'Looks up a city',
			schema: z.object({ city: z.string() }),
			strict: false,
			handler: vi.fn().mockResolvedValue('ok'),
		})

		expect(tool.definition.strict).toBe(false)
	})
})
