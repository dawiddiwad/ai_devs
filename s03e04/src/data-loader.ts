import fs from 'fs'
import path from 'path'
import { config } from './config'
import { logger } from './logger'

interface ItemEntry {
	name: string
	code: string
	tokens: Set<string>
}

const STOP_WORDS = new Set([
	'potrzebuję',
	'potrzebuje',
	'mam',
	'jest',
	'są',
	'the',
	'and',
	'or',
	'a',
	'i',
	'do',
	'w',
	'na',
	'z',
	'ze',
	'dla',
	'to',
	'że',
	'nie',
	'jak',
	'czy',
	'mi',
	'się',
	'by',
	'o',
])

function tokenize(text: string): Set<string> {
	return new Set(
		text
			.toLowerCase()
			.replace(/[^\w\s]/g, ' ')
			.split(/\s+/)
			.filter((t) => t.length > 1 && !STOP_WORDS.has(t))
	)
}

function readCsv(filePath: string): string[][] {
	const content = fs.readFileSync(filePath, 'utf-8')
	return content
		.split('\n')
		.slice(1)
		.filter((line) => line.trim().length > 0)
		.map((line) => {
			const commaIdx = line.indexOf(',')
			return [line.slice(0, commaIdx).trim(), line.slice(commaIdx + 1).trim()]
		})
}

let cityCodeToName: Map<string, string>
let items: ItemEntry[]
let itemCodeToCities: Map<string, string[]>

export function loadData(): void {
	cityCodeToName = new Map()
	items = []
	itemCodeToCities = new Map()

	const citiesRows = readCsv(path.join(config.dataDir, 'cities.csv'))
	for (const [name, code] of citiesRows) {
		cityCodeToName.set(code, name)
	}
	logger.tool('info', 'Cities loaded', { count: cityCodeToName.size })

	const itemsRows = readCsv(path.join(config.dataDir, 'items.csv'))
	for (const [name, code] of itemsRows) {
		items.push({ name, code, tokens: tokenize(name) })
	}
	logger.tool('info', 'Items loaded', { count: items.length })

	const connectionsRows = readCsv(path.join(config.dataDir, 'connections.csv'))
	for (const [itemCode, cityCode] of connectionsRows) {
		const existing = itemCodeToCities.get(itemCode)
		if (existing) {
			existing.push(cityCode)
		} else {
			itemCodeToCities.set(itemCode, [cityCode])
		}
	}
	logger.tool('info', 'Connections loaded', { count: connectionsRows.length })
}

const PREFIX_MIN_LEN = 5

function tokensMatch(queryToken: string, itemToken: string): boolean {
	if (queryToken === itemToken) return true
	const minLen = Math.min(queryToken.length, itemToken.length, PREFIX_MIN_LEN)
	if (minLen < PREFIX_MIN_LEN) return false
	return (
		queryToken.startsWith(itemToken.slice(0, PREFIX_MIN_LEN)) ||
		itemToken.startsWith(queryToken.slice(0, PREFIX_MIN_LEN))
	)
}

export function findCitiesByQuery(query: string): string {
	const queryTokens = tokenize(query)
	if (queryTokens.size === 0) {
		return 'No item found. Try different keywords.'
	}

	let bestItem: ItemEntry | null = null
	let bestScore = 0

	for (const item of items) {
		let overlap = 0
		for (const qt of queryTokens) {
			for (const it of item.tokens) {
				if (tokensMatch(qt, it)) {
					overlap++
					break
				}
			}
		}
		const score = overlap / queryTokens.size
		if (score > bestScore) {
			bestScore = score
			bestItem = item
		}
	}

	if (!bestItem || bestScore === 0) {
		return 'No item found. Try different keywords.'
	}

	const cityCodes = itemCodeToCities.get(bestItem.code) || []
	const cityNames = cityCodes.map((code) => cityCodeToName.get(code) || code)

	if (cityNames.length === 0) {
		return `Item "${bestItem.name}" found but no cities sell it.`
	}

	let output = `Cities selling "${bestItem.name}": ${cityNames.join(', ')}`

	if (Buffer.byteLength(output, 'utf8') > 490) {
		const truncated: string[] = []
		let size = `Cities selling "${bestItem.name}": `.length
		for (const name of cityNames) {
			if (size + name.length + 2 > 450) {
				output = `Cities selling "${bestItem.name}": ${truncated.join(', ')} and ${cityNames.length - truncated.length} more`
				break
			}
			truncated.push(name)
			size += name.length + 2
		}
	}

	return output
}
