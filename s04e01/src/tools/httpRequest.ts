import { z } from 'zod/v4'
import axios from 'axios'
import { wrapper } from 'axios-cookiejar-support'
import { CookieJar } from 'tough-cookie'
import { logger } from '../logger'
import { defineTool } from '../tool-factory'

const jar = new CookieJar()
const client = wrapper(axios.create({ jar, withCredentials: true }))

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
		'Make HTTP requests to the OKO API. Manages session cookies automatically via internal cookie jar. Use for OKO browsing only — not for Centrala writes.',
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

		const response = await client.request({
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
