import type { PersonHintsMap } from './types.js'
import { findBestMatch, transliterate } from './normalizer.js'

const FULL_NAME_REGEX = /\b[A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż]+\s+[A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż]+\b/g

function detectCity(text: string, knownCities: string[]): string | null {
	const words = transliterate(text).toLowerCase().split(/\W+/)
	for (const word of words) {
		if (word.length < 3) continue
		const match = findBestMatch(word, knownCities)
		if (match) return match
	}
	return null
}

function extractFullNames(text: string, knownCities: string[]): string[] {
	const fullNames: string[] = []
	const seen = new Set<string>()

	for (const match of text.matchAll(FULL_NAME_REGEX)) {
		const name = match[0].trim()
		const parts = name.split(/\s+/)
		if (parts.some((part) => part.length < 3)) continue
		if (!name || seen.has(name)) continue
		if (parts.some((part) => findBestMatch(part, knownCities))) continue
		seen.add(name)
		fullNames.push(name)
	}

	return fullNames
}

function normalizeSnippet(text: string): string {
	return text.replace(/\s+/g, ' ').trim()
}

export function parseRozmowy(text: string, knownCities: string[]): PersonHintsMap {
	const personHints = Object.fromEntries(
		knownCities.map((city) => [
			city,
			{
				fullNames: [] as string[],
				snippets: [] as string[],
			},
		])
	)
	const paragraphs = text
		.split(/\n\s*\n/)
		.map((paragraph) => paragraph.trim())
		.filter(Boolean)

	for (const paragraph of paragraphs) {
		if (paragraph.startsWith('=')) continue

		const city = detectCity(paragraph, knownCities)
		if (!city) continue

		const snippet = normalizeSnippet(paragraph)
		if (snippet && !personHints[city].snippets.includes(snippet)) {
			personHints[city].snippets.push(snippet)
		}

		const names = extractFullNames(paragraph, knownCities)
		for (const name of names) {
			if (!personHints[city].fullNames.includes(name)) personHints[city].fullNames.push(name)
		}
	}

	return personHints
}
