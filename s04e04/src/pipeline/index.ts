import type { TradeMap } from './types.js'
import { parseTransakcje } from './transakcje-parser.js'
import { parseOgloszenia } from './ogloszenia-parser.js'
import { parseRozmowy } from './rozmowy-parser.js'
import { extractCandidates, buildGoodsVocab } from './vocab.js'

function splitFiles(rawText: string): Record<string, string> {
	const files: Record<string, string> = {}
	const sections = rawText.split(/=== (.+?) ===/)
	for (let i = 1; i < sections.length; i += 2) {
		const name = sections[i].trim()
		const content = sections[i + 1]?.trim() ?? ''
		files[name] = content
	}
	return files
}

export function runPipeline(rawNotesText: string): TradeMap {
	const files = splitFiles(rawNotesText)

	const transakcjeText = files['transakcje.txt'] ?? ''
	const ogloszeniaText = files['og\u0142oszenia.txt'] ?? files['ogloszenia.txt'] ?? ''
	const rozmowyText = files['rozmowy.txt'] ?? ''

	const { sellers, knownCities, knownGoods } = parseTransakcje(transakcjeText)
	const rawCandidates = extractCandidates(ogloszeniaText, knownCities)
	const allGoods = buildGoodsVocab(rawCandidates, knownGoods)
	const parsedDemand = parseOgloszenia(ogloszeniaText, knownCities, allGoods)
	const demand = Object.fromEntries(knownCities.map((city) => [city, parsedDemand[city] ?? {}]))
	const personHints = parseRozmowy(rozmowyText, knownCities)

	return {
		sellers,
		demand,
		personHints,
	}
}
