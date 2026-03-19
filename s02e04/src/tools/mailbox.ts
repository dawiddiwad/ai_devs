import axios from 'axios'
import { config } from '../config'
import { logger } from '../logger'
import { getInboxSchema, getThreadSchema, getMessagesSchema, searchSchema, waitSchema } from './definitions'

async function zmailRequest(payload: Record<string, unknown>, retries = 3): Promise<unknown> {
	for (let attempt = 1; attempt <= retries; attempt++) {
		try {
			logger.api('info', 'Zmail API request', { action: payload.action, attempt })
			const response = await axios.post(config.zmailEndpoint, {
				apikey: config.aiDevsApiKey,
				...payload,
			})
			logger.api('info', 'Zmail API response', { action: payload.action, status: response.status })
			return response.data
		} catch (error) {
			const isLast = attempt === retries
			if (axios.isAxiosError(error) && error.response && error.response.status < 500) {
				logger.api('error', 'Zmail API client error', {
					status: error.response.status,
					data: error.response.data,
				})
				throw error
			}
			logger.api('warn', `Zmail API attempt ${attempt} failed`, {
				error: error instanceof Error ? error.message : String(error),
			})
			if (isLast) throw error
			await new Promise((resolve) => setTimeout(resolve, 1000 * Math.pow(2, attempt - 1)))
		}
	}
	throw new Error('Unreachable')
}

export async function getInbox(args: unknown): Promise<string> {
	const parsed = getInboxSchema.parse(args)
	logger.tool('info', 'getInbox called', { page: parsed.page, perPage: parsed.perPage })
	const data = await zmailRequest({ action: 'getInbox', page: parsed.page, perPage: parsed.perPage })
	logger.tool('info', 'getInbox result', { data })
	return JSON.stringify(data)
}

export async function getThread(args: unknown): Promise<string> {
	const parsed = getThreadSchema.parse(args)
	logger.tool('info', 'getThread called', { threadID: parsed.threadID })
	const data = await zmailRequest({ action: 'getThread', threadID: parsed.threadID })
	logger.tool('info', 'getThread result', { data })
	return JSON.stringify(data)
}

export async function getMessages(args: unknown): Promise<string> {
	const parsed = getMessagesSchema.parse(args)
	logger.tool('info', 'getMessages called', { ids: parsed.ids })
	const data = await zmailRequest({ action: 'getMessages', ids: parsed.ids })
	logger.tool('info', 'getMessages result', { data })
	return JSON.stringify(data)
}

export async function search(args: unknown): Promise<string> {
	const parsed = searchSchema.parse(args)
	logger.tool('info', 'search called', { query: parsed.query, page: parsed.page, perPage: parsed.perPage })
	const data = await zmailRequest({
		action: 'search',
		query: parsed.query,
		page: parsed.page,
		perPage: parsed.perPage,
	})
	logger.tool('info', 'search result', { data })
	return JSON.stringify(data)
}

export async function wait(args: unknown): Promise<string> {
	const parsed = waitSchema.parse(args)
	const seconds = parsed.seconds ?? 30
	logger.tool('info', `Waiting ${seconds} seconds`, { seconds })
	await new Promise((resolve) => setTimeout(resolve, seconds * 1000))
	return JSON.stringify({ waited: seconds })
}

export async function helpMail(): Promise<string> {
	logger.tool('info', 'helpMail called')
	const data = await zmailRequest({ action: 'help' })
	logger.tool('info', 'helpMail result', { data })
	return JSON.stringify(data)
}
