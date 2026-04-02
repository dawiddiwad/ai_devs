import { NlpUtil } from 'node-nlp'

const stemmer = NlpUtil.getStemmer('pl')
const tokenizer = NlpUtil.getTokenizer('pl')

export function stemToken(word: string): string {
	return stemmer.stem(word.toLowerCase())
}

export function tokenize(text: string): string[] {
	return tokenizer.tokenize(text)
}
