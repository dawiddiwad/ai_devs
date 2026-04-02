import { stemToken } from './stemmer.js'
import { transliterate, findBestMatch } from './normalizer.js'
import { chooseCanonicalGood, findBestGoodMatch } from './goods.js'
import { extractQuantifiedWords } from './quantities.js'

const MIN_WORD_LEN = 3

export function extractCandidates(text: string, excludeWords?: string[]): string[] {
	const excluded = new Set(excludeWords?.map((w) => w.toLowerCase()) ?? [])
	const candidates = new Set<string>()

	for (const { word } of extractQuantifiedWords(text)) {
		if (word.length < MIN_WORD_LEN) continue
		if (excluded.has(word)) continue
		candidates.add(transliterate(word).toLowerCase())
	}

	return [...candidates]
}

export function buildGoodsVocab(rawCandidates: string[], knownGoods: string[]): string[] {
	const unmatched: string[] = []
	const matchedGoods = new Set<string>(knownGoods)
	for (const word of rawCandidates) {
		const match = findBestGoodMatch(word, knownGoods) ?? findBestMatch(word, knownGoods)
		if (!match) {
			unmatched.push(word)
		}
	}

	if (unmatched.length === 0) {
		return knownGoods
	}

	const stemGroups = new Map<string, string[]>()
	for (const word of unmatched) {
		const stem = stemToken(word)
		if (!stemGroups.has(stem)) stemGroups.set(stem, [])
		stemGroups.get(stem)!.push(word)
	}

	const stemKeys = [...stemGroups.keys()]
	const mergedInto = new Map<string, string>()

	for (let i = 0; i < stemKeys.length; i++) {
		const stemA = stemKeys[i]
		const canonical = mergedInto.get(stemA) ?? stemA
		const wordsA = stemGroups.get(stemA)!

		for (let j = i + 1; j < stemKeys.length; j++) {
			const stemB = stemKeys[j]
			if (mergedInto.has(stemB)) continue
			const wordsB = stemGroups.get(stemB)!

			outer: for (const a of wordsA) {
				for (const b of wordsB) {
					const maxLen = Math.max(a.length, b.length)
					const threshold = Math.max(2, Math.round(0.4 * maxLen))
					const dist = levenshteinDist(a, b)
					if (dist <= threshold) {
						mergedInto.set(stemB, canonical)
						break outer
					}
				}
			}
		}
	}

	const groups = new Map<string, string[]>()
	for (const [stem, words] of stemGroups) {
		const root = mergedInto.get(stem) ?? stem
		if (!groups.has(root)) groups.set(root, [])
		groups.get(root)!.push(...words)
	}

	for (const words of groups.values()) {
		const canonical = chooseCanonicalGood(words)
		matchedGoods.add(canonical)
	}

	return [...matchedGoods]
}

function levenshteinDist(a: string, b: string): number {
	const m = a.length
	const n = b.length
	const dp: number[][] = Array.from({ length: m + 1 }, (_, i) => Array.from({ length: n + 1 }, (_, j) => i || j))
	for (let i = 1; i <= m; i++) {
		for (let j = 1; j <= n; j++) {
			dp[i][j] =
				a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
		}
	}
	return dp[m][n]
}
