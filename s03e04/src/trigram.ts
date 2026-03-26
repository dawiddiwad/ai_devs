const TRIGRAM_SIZE = 3

export function computeTrigrams(text: string): Set<string> {
	const normalized = text.toLowerCase().replace(/[^\w]/g, '')
	const grams = new Set<string>()
	for (let i = 0; i <= normalized.length - TRIGRAM_SIZE; i++) {
		grams.add(normalized.slice(i, i + TRIGRAM_SIZE))
	}
	return grams
}

export function countTrigramOverlap(queryGrams: Set<string>, itemGrams: Set<string>): number {
	let overlap = 0
	for (const gram of queryGrams) {
		if (itemGrams.has(gram)) overlap++
	}
	return overlap
}
