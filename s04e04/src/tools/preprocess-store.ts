import { randomUUID } from 'node:crypto'
import type { DemandMap, SellersMap } from '../pipeline/types.js'

interface StoredDataset {
	demand: DemandMap
	sellers: SellersMap
}

const datasets = new Map<string, StoredDataset>()

export function saveDataset(dataset: StoredDataset): string {
	const id = randomUUID()
	datasets.set(id, dataset)
	return id
}

export function getDataset(id: string): StoredDataset | null {
	return datasets.get(id) ?? null
}
