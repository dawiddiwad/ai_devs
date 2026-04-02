import { tokenize } from './stemmer.js'
import { transliterate } from './normalizer.js'

export interface QuantifiedWord {
	quantity: number
	word: string
}

function normalizeTokens(text: string): string[] {
	return tokenize(transliterate(text).toLowerCase())
}

function isNumberToken(token: string): boolean {
	return /^\d+$/.test(token)
}

function isWordToken(token: string): boolean {
	return /^[a-z]+$/.test(token)
}

function splitQuantitySegments(text: string): string[] {
	return transliterate(text)
		.split(/\n|,|\+|:|;|\.|\s+i\s+|\s+oraz\s+/i)
		.map((segment) => segment.trim())
		.filter(Boolean)
}

function getWordsBefore(tokens: string[], index: number): string[] {
	const words: string[] = []
	for (let i = 0; i < index; i++) {
		if (isWordToken(tokens[i])) words.push(tokens[i])
	}
	return words
}

function getWordsAfter(tokens: string[], index: number): string[] {
	const words: string[] = []
	for (let i = index + 1; i < tokens.length; i++) {
		if (isNumberToken(tokens[i])) break
		if (isWordToken(tokens[i])) words.push(tokens[i])
	}
	return words
}

function selectCandidateWord(before: string[], after: string[]): string | null {
	if (before.length === 1 && after.length <= 1) return before[0]
	if (after.length > 0) return after[after.length - 1]
	if (before.length > 0) return before[before.length - 1]
	return null
}

export function extractQuantifiedWords(text: string): QuantifiedWord[] {
	const quantified: QuantifiedWord[] = []

	for (const segment of splitQuantitySegments(text)) {
		const tokens = normalizeTokens(segment)

		for (let i = 0; i < tokens.length; i++) {
			if (!isNumberToken(tokens[i])) continue
			const quantity = parseInt(tokens[i], 10)
			const before = getWordsBefore(tokens, i)
			const after = getWordsAfter(tokens, i)
			const word = selectCandidateWord(before, after)
			if (!word) continue
			quantified.push({ quantity, word })
		}
	}

	return quantified
}
