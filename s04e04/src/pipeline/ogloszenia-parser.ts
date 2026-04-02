import type { DemandMap } from './types.js'
import { transliterate, findBestMatch } from './normalizer.js'
import { findBestGoodMatch } from './goods.js'
import { extractQuantifiedWords } from './quantities.js'

function detectCity(text: string, knownCities: string[]): string | null {
	const words = transliterate(text).toLowerCase().split(/\W+/)
	for (const word of words) {
		if (word.length < 3) continue
		const match = findBestMatch(word, knownCities)
		if (match) return match
	}
	return null
}

function parseItem(item: string, knownGoods: string[]): [string, number] | null {
	const quantified = extractQuantifiedWords(item)[0]
	if (!quantified) return null
	const canonical = findBestGoodMatch(quantified.word, knownGoods) ?? findBestMatch(quantified.word, knownGoods)
	return canonical ? [canonical, quantified.quantity] : null
}

function parseGoods(text: string, knownGoods: string[]): Array<[string, number]> {
	const result = new Map<string, number>()
	const items = text.split(/,\s*|\s+\+\s+|\s+i\s+/)

	for (const item of items) {
		const parsed = parseItem(item, knownGoods)
		if (parsed && !result.has(parsed[0])) {
			result.set(parsed[0], parsed[1])
		}
	}

	return [...result.entries()]
}

export function parseOgloszenia(text: string, knownCities: string[], knownGoods: string[]): DemandMap {
	const demand: DemandMap = {}
	const paragraphs = text
		.split(/\n\s*\n/)
		.map((p) => p.trim())
		.filter(Boolean)

	for (const paragraph of paragraphs) {
		if (paragraph.startsWith('---')) continue

		const city = detectCity(paragraph, knownCities)
		if (!city) continue

		const goods = parseGoods(paragraph, knownGoods)
		if (goods.length === 0) continue

		demand[city] = {}
		for (const [good, qty] of goods) {
			demand[city][good] = qty
		}
	}

	return demand
}
