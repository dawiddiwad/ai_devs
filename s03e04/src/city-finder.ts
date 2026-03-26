import { Catalog } from './catalog'
import { selectCandidates } from './candidate-selector'
import { createItemMatcher, ItemMatcher } from './item-matcher'
import { logger } from './logger'

const RESPONSE_BYTE_LIMIT = 490
const RESPONSE_SAFE_BYTE_LIMIT = 450

function formatCityList(itemName: string, cityNames: string[]): string {
	const prefix = `Cities selling "${itemName}": `
	const full = prefix + cityNames.join(', ')

	if (Buffer.byteLength(full, 'utf8') <= RESPONSE_BYTE_LIMIT) {
		return full
	}

	const truncated: string[] = []
	let size = prefix.length
	for (const name of cityNames) {
		if (size + name.length + 2 > RESPONSE_SAFE_BYTE_LIMIT) break
		truncated.push(name)
		size += name.length + 2
	}

	return `${prefix}${truncated.join(', ')} and ${cityNames.length - truncated.length} more`
}

export type CityFinder = (query: string) => Promise<string>

export function createCityFinder(catalog: Catalog, matchItem: ItemMatcher = createItemMatcher()): CityFinder {
	return async function findCitiesByQuery(query: string): Promise<string> {
		logger.tool('info', 'Matching item', { query })

		const candidates = selectCandidates(query, catalog.items)
		logger.tool('debug', 'Candidates selected', { count: candidates.length })

		const item = await matchItem(query, candidates)

		if (!item) {
			logger.tool('warn', 'No item matched', { query })
			return 'No matching item found. Try rephrasing the query.'
		}

		logger.tool('info', 'Item matched', { item: item.name, code: item.code })

		const cityCodes = catalog.citiesByItemCode.get(item.code) ?? []
		const cityNames = cityCodes.map((code) => catalog.cityByCode.get(code) ?? code)

		if (cityNames.length === 0) {
			return `Item "${item.name}" found but no cities sell it.`
		}

		return formatCityList(item.name, cityNames)
	}
}
