export type FileId = 'transakcje' | 'ogloszenia' | 'rozmowy'

export type SupplyMap = Record<string, string[]>

export type DemandMap = Record<string, Record<string, number>>

export interface IndexEntry {
	file: FileId
	lineIndex: number
	surface: string
}

export type InvertedIndex = Map<string, IndexEntry[]>

export interface EntityCluster {
	canonical: string
	stem: string
	variants: string[]
	files: FileId[]
}

export type SellersMap = Record<string, string[]>

export interface PersonHints {
	fullNames: string[]
	snippets: string[]
}

export type PersonHintsMap = Record<string, PersonHints>

export interface TradeMap {
	sellers: SellersMap
	demand: DemandMap
	personHints: PersonHintsMap
}
