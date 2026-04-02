import { stemToken } from './stemmer.js'
import { transliterate } from './normalizer.js'

function levenshtein(a: string, b: string): number {
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

function normalizeWord(word: string): string {
	return transliterate(word).toLowerCase().trim()
}

function prefersFeminineAStem(base: string): boolean {
	return /(?:t|d|n|r|l|w|z|s|c)$/.test(base)
}

export function generateGoodVariants(word: string): string[] {
	const normalized = normalizeWord(word)
	const variants: string[] = []

	if (/arki$/.test(normalized)) variants.push(`${normalized.slice(0, -1)}a`)
	if (/aki$/.test(normalized)) variants.push(normalized.slice(0, -1))
	if (/[bcdfghjklmnprswtz]ki$/.test(normalized)) variants.push(`${normalized.slice(0, -2)}ek`)
	if (/ow$/.test(normalized)) variants.push(normalized.slice(0, -2))
	if (/y$/.test(normalized)) {
		const base = normalized.slice(0, -1)
		if (prefersFeminineAStem(base)) variants.push(`${base}a`)
		variants.push(base)
	}
	if (/i$/.test(normalized) && !/ki$/.test(normalized)) variants.push(normalized.slice(0, -1))
	variants.push(normalized)

	return [...new Set(variants)].filter((variant) => /^[a-z]+$/.test(variant) && variant.length >= 3)
}

export function findBestGoodMatch(raw: string, candidates: string[]): string | null {
	if (candidates.length === 0) return null

	const variants = generateGoodVariants(raw)

	for (const variant of variants) {
		const exact = candidates.find((candidate) => candidate.toLowerCase() === variant)
		if (exact) return exact
	}

	for (const variant of variants) {
		const variantStem = stemToken(variant)
		const stemMatch = candidates.find((candidate) => stemToken(candidate.toLowerCase()) === variantStem)
		if (stemMatch) return stemMatch
	}

	let best: string | null = null
	let bestDistance = Infinity

	for (const variant of variants) {
		for (const candidate of candidates) {
			const distance = levenshtein(variant, candidate.toLowerCase())
			const maxLen = Math.max(variant.length, candidate.length)
			const threshold = Math.max(2, Math.round(0.4 * maxLen))
			if (distance > threshold) continue
			if (distance < bestDistance) {
				bestDistance = distance
				best = candidate
			}
		}
	}

	return best
}

function scoreCanonicalCandidate(candidate: string, observed: string[]): number {
	let score = 0

	for (const word of observed) {
		const variants = generateGoodVariants(word)
		const variantIndex = variants.indexOf(candidate)
		if (variantIndex >= 0) score += Math.max(1, 8 - variantIndex * 2)
		if (stemToken(word) === stemToken(candidate)) score += 2
	}

	if (/(ow|ew|ki|i|y)$/.test(candidate)) score -= 3
	if (candidate.endsWith('a')) score += 1

	return score - candidate.length * 0.01
}

export function chooseCanonicalGood(words: string[]): string {
	const observed = [...new Set(words.map(normalizeWord).filter(Boolean))]
	const candidateSet = new Set<string>()

	for (const word of observed) {
		for (const variant of generateGoodVariants(word)) {
			candidateSet.add(variant)
		}
	}

	let best = observed[0]
	let bestScore = Number.NEGATIVE_INFINITY

	for (const candidate of candidateSet) {
		const score = scoreCanonicalCandidate(candidate, observed)
		if (
			score > bestScore ||
			(score === bestScore && candidate.length < best.length) ||
			(score === bestScore && candidate.length === best.length && candidate < best)
		) {
			best = candidate
			bestScore = score
		}
	}

	return best
}
