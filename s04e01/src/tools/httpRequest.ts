import { z } from 'zod/v4'
import axios from 'axios'
import { logger } from '../logger'
import { defineTool } from '../tool-factory'

const schema = z.object({
	url: z.string().describe('Full URL'),
	method: z.enum(['GET', 'POST']).describe('HTTP method'),
	body: z.record(z.string(), z.unknown()).optional().describe('JSON body for POST'),
	headers: z.record(z.string(), z.string()).optional().describe('Extra request headers'),
	bodyEncoding: z.enum(['json', 'form']).optional().describe('Body encoding, default json'),
})

export const httpRequestTool = defineTool({
	name: 'http_request',
	description:
		'Make raw HTTP requests for non-HTML content only (JSON APIs, plain text endpoints). Do NOT use for web pages or portals — use browser tools instead.',
	schema,
	strict: false,
	handler: async ({ url, method, body, headers: extraHeaders, bodyEncoding }) => {
		logger.tool('info', `${method} ${url}`)

		const requestHeaders: Record<string, string> = { ...extraHeaders }
		let requestData: unknown = undefined

		if (body) {
			if (bodyEncoding === 'form') {
				requestData = new URLSearchParams(body as Record<string, string>).toString()
				requestHeaders['Content-Type'] = 'application/x-www-form-urlencoded'
			} else {
				requestData = body
			}
		}

		const response = await axios.request({
			url,
			method,
			data: requestData,
			headers: requestHeaders,
			validateStatus: () => true,
		})

		let responseBody: unknown
		if (typeof response.data === 'string') {
			try {
				responseBody = JSON.parse(response.data)
			} catch {
				responseBody = response.data
			}
		} else {
			responseBody = response.data
		}

		logger.tool('info', `Response ${response.status}`, { url })
		return JSON.stringify({ status: response.status, body: responseBody })
	},
})
