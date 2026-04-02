declare module 'node-nlp' {
	export const NlpUtil: {
		getStemmer(locale: string): { stem(word: string): string }
		getTokenizer(locale: string): { tokenize(text: string): string[] }
	}
}
