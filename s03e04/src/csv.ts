import fs from 'fs'

export function parseCsvPairs(filePath: string): [string, string][] {
	return fs
		.readFileSync(filePath, 'utf-8')
		.split('\n')
		.slice(1)
		.filter((line) => line.trim().length > 0)
		.map((line) => {
			const commaIdx = line.indexOf(',')
			return [line.slice(0, commaIdx).trim(), line.slice(commaIdx + 1).trim()]
		})
}
