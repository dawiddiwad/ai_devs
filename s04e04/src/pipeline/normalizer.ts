import { stemToken } from './stemmer.js'

export function transliterate(s: string): string {
	return s
		.replace(/ą/g, 'a')
		.replace(/Ą/g, 'A')
		.replace(/ć/g, 'c')
		.replace(/Ć/g, 'C')
		.replace(/ę/g, 'e')
		.replace(/Ę/g, 'E')
		.replace(/ł/g, 'l')
		.replace(/Ł/g, 'L')
		.replace(/ń/g, 'n')
		.replace(/Ń/g, 'N')
		.replace(/ó/g, 'o')
		.replace(/Ó/g, 'O')
		.replace(/ś/g, 's')
		.replace(/Ś/g, 'S')
		.replace(/ź/g, 'z')
		.replace(/Ź/g, 'Z')
		.replace(/ż/g, 'z')
		.replace(/Ż/g, 'Z')
}

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

export function findBestMatch(raw: string, candidates: string[]): string | null {
	if (candidates.length === 0) return null

	const normalized = transliterate(raw).toLowerCase()

	const exact = candidates.find((c) => c.toLowerCase() === normalized)
	if (exact) return exact

	const stem = stemToken(normalized)
	const stemMatch = candidates.find((c) => stemToken(c.toLowerCase()) === stem)
	if (stemMatch) return stemMatch

	let best: string | null = null
	let bestDist = Infinity

	for (const candidate of candidates) {
		const dist = levenshtein(normalized, candidate.toLowerCase())
		const maxLen = Math.max(normalized.length, candidate.length)
		const threshold = Math.max(2, Math.round(0.4 * maxLen))

		if (dist <= threshold && dist < bestDist) {
			bestDist = dist
			best = candidate
		}
	}

	return best
}
