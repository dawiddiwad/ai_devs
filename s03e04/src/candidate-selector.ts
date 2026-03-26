import { CatalogItem } from './catalog'
import { computeTrigrams, countTrigramOverlap } from './trigram'

const CANDIDATES_LIMIT = 40
const MIN_TRIGRAM_MATCHES_FOR_FILTERING = 3

export function selectCandidates(query: string, items: CatalogItem[]): CatalogItem[] {
	const queryGrams = computeTrigrams(query)

	if (queryGrams.size === 0) {
		return items.slice(0, CANDIDATES_LIMIT)
	}

	const scored = items
		.map((item) => ({ item, score: countTrigramOverlap(queryGrams, item.trigrams) }))
		.filter((s) => s.score > 0)
		.sort((a, b) => b.score - a.score)

	if (scored.length >= MIN_TRIGRAM_MATCHES_FOR_FILTERING) {
		return scored.slice(0, CANDIDATES_LIMIT).map((s) => s.item)
	}

	return items.slice(0, CANDIDATES_LIMIT)
}
