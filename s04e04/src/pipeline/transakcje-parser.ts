import type { SupplyMap, SellersMap } from './types.js'
import { transliterate } from './normalizer.js'
import { chooseCanonicalGood } from './goods.js'

export interface ParsedTransakcje {
	supply: SupplyMap
	sellers: SellersMap
	knownCities: string[]
	knownGoods: string[]
}

export function parseTransakcje(text: string): ParsedTransakcje {
	const supply: SupplyMap = {}
	const sellers: SellersMap = {}
	const citiesSet = new Set<string>()
	const goodsSet = new Set<string>()

	const lines = text
		.split('\n')
		.map((l) => l.trim())
		.filter(Boolean)
	for (const line of lines) {
		const match = line.match(/^(.+?) -> (.+?) -> (.+?)$/)
		if (!match) continue

		const source = transliterate(match[1].trim())
		const dest = transliterate(match[3].trim())
		const good = chooseCanonicalGood([match[2].trim()])

		citiesSet.add(source)
		citiesSet.add(dest)
		goodsSet.add(good)

		if (!supply[source]) supply[source] = []
		if (!supply[source].includes(good)) supply[source].push(good)

		if (!sellers[good]) sellers[good] = []
		if (!sellers[good].includes(source)) sellers[good].push(source)
	}

	return {
		supply,
		sellers,
		knownCities: [...citiesSet].sort(),
		knownGoods: [...goodsSet].sort(),
	}
}
