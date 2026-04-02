import type { FileId, IndexEntry, InvertedIndex, EntityCluster } from './types.js'
import { stemToken, tokenize } from './stemmer.js'
import { transliterate } from './normalizer.js'

const MIN_TOKEN_LEN = 3

export interface FileInput {
	id: FileId
	text: string
}

export function buildInvertedIndex(files: FileInput[]): InvertedIndex {
	const index: InvertedIndex = new Map()

	for (const file of files) {
		const lines = file.text.split('\n')
		for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
			const tokens = tokenize(transliterate(lines[lineIndex]))

			for (const token of tokens) {
				const lower = token.toLowerCase()
				if (lower.length < MIN_TOKEN_LEN) continue
				if (/^\d+$/.test(lower)) continue

				const stem = stemToken(lower)
				const entry: IndexEntry = { file: file.id, lineIndex, surface: token }

				if (!index.has(stem)) index.set(stem, [])
				index.get(stem)!.push(entry)
			}
		}
	}

	return index
}

export function buildEntityClusters(index: InvertedIndex, knownEntities: string[]): EntityCluster[] {
	const clusters: EntityCluster[] = []

	const entityLookup = new Map<string, string>()
	for (const entity of knownEntities) {
		entityLookup.set(entity.toLowerCase(), entity)
	}

	for (const [stem, entries] of index) {
		const fileSet = new Set(entries.map((e) => e.file))
		if (fileSet.size < 2) continue

		const surfaceFreq = new Map<string, number>()
		let canonical: string | null = null

		for (const entry of entries) {
			const lower = transliterate(entry.surface).toLowerCase()
			if (!canonical && entityLookup.has(lower)) {
				canonical = entityLookup.get(lower)!
			}
			surfaceFreq.set(entry.surface, (surfaceFreq.get(entry.surface) ?? 0) + 1)
		}

		if (!canonical) {
			let maxFreq = 0
			for (const [surface, freq] of surfaceFreq) {
				if (freq > maxFreq) {
					maxFreq = freq
					canonical = surface
				}
			}
		}

		if (!canonical) continue

		const variants = [...new Set(entries.map((e) => e.surface))]
		const files = [...fileSet] as FileId[]

		clusters.push({ canonical, stem, variants, files })
	}

	return clusters
}
