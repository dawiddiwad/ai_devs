import { describe, expect, it } from 'vitest'
import { sanitizeForObservability, truncateString } from '../src/observability.js'

describe('truncateString', () => {
	it('truncates long plain strings', () => {
		expect(truncateString('a'.repeat(50), 10)).toBe('aaaaaaaaaa... [truncated 40 chars]')
	})

	it('preserves full base64 data URIs', () => {
		const dataUri = `data:image/jpeg;base64,${'A'.repeat(5000)}`

		expect(truncateString(dataUri, 100)).toBe(dataUri)
	})

	it('preserves strings that contain base64 data URIs', () => {
		const dataUri = `data:application/pdf;base64,${'A'.repeat(5000)}`
		const wrapped = JSON.stringify({ file_data: dataUri })

		expect(truncateString(wrapped, 100)).toBe(wrapped)
	})
})

describe('sanitizeForObservability', () => {
	it('preserves nested media payloads while still traversing objects', () => {
		const imageUrl = `data:image/jpeg;base64,${'A'.repeat(5000)}`
		const payload = {
			input: [
				{
					role: 'user',
					content: [
						{ type: 'input_text', text: 'look at this attachment' },
						{ type: 'input_image', image_url: imageUrl },
					],
				},
			],
		}

		expect(sanitizeForObservability(payload, 100)).toEqual(payload)
	})
})
