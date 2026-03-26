import path from 'path'
import { config } from './config'
import { logger } from './logger'
import { parseCsvPairs } from './csv'
import { computeTrigrams } from './trigram'

export interface CatalogItem {
	name: string
	code: string
	trigrams: Set<string>
}

export interface Catalog {
	items: CatalogItem[]
	cityByCode: Map<string, string>
	citiesByItemCode: Map<string, string[]>
}

export function loadCatalog(): Catalog {
	const cityByCode = new Map<string, string>()
	const citiesByItemCode = new Map<string, string[]>()

	for (const [name, code] of parseCsvPairs(path.join(config.dataDir, 'cities.csv'))) {
		cityByCode.set(code, name)
	}
	logger.tool('info', 'Cities loaded', { count: cityByCode.size })

	const items: CatalogItem[] = parseCsvPairs(path.join(config.dataDir, 'items.csv')).map(([name, code]) => ({
		name,
		code,
		trigrams: computeTrigrams(name),
	}))
	logger.tool('info', 'Items loaded', { count: items.length })

	for (const [itemCode, cityCode] of parseCsvPairs(path.join(config.dataDir, 'connections.csv'))) {
		const cities = citiesByItemCode.get(itemCode)
		if (cities) {
			cities.push(cityCode)
		} else {
			citiesByItemCode.set(itemCode, [cityCode])
		}
	}
	logger.tool('info', 'Connections loaded', { count: citiesByItemCode.size })

	return { items, cityByCode, citiesByItemCode }
}
