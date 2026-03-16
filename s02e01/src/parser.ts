import { CargoItem } from './types'

const splitCsvLine = (line: string): string[] => {
  const values: string[] = []
  let current = ''
  let inQuotes = false

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]

    if (char === '"') {
      const nextChar = line[index + 1]
      if (inQuotes && nextChar === '"') {
        current += '"'
        index += 1
        continue
      }
      inQuotes = !inQuotes
      continue
    }

    if (char === ',' && !inQuotes) {
      values.push(current.trim())
      current = ''
      continue
    }

    current += char
  }

  values.push(current.trim())
  return values
}

export const parseCategorizeCsv = (rawCsv: string): CargoItem[] => {
  const lines = rawCsv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  if (lines.length === 0) {
    return []
  }

  const headerColumns = splitCsvLine(lines[0]).map((value) => value.toLowerCase())
  const idAliases = ['id', 'code', 'item_id', 'itemid']
  const idIndex = headerColumns.findIndex((column) => idAliases.includes(column))
  const descriptionIndex = headerColumns.findIndex((column) => column === 'description')

  if (idIndex === -1 || descriptionIndex === -1) {
    throw new Error('CSV header must contain identifier and description columns')
  }

  return lines.slice(1).map((line) => {
    const columns = splitCsvLine(line)
    const id = columns[idIndex] ?? ''
    const description = columns[descriptionIndex] ?? ''

    return {
      id,
      description
    }
  })
}
