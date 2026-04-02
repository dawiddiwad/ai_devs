import { createConfig, defineAgentTool, logger, verifyAnswer } from '@ai-devs/core'
import { z } from 'zod/v4'
import { transliterate } from '../pipeline/normalizer.js'
import { getDataset } from './preprocess-store.js'

const config = createConfig()

type FilesystemAction = {
	action: string
	path?: string
	content?: string
}

const NAME_PATTERN = /^[a-z0-9_]+$/
const MAX_DIRECTORY_NAME_LENGTH = 30
const MAX_FILE_NAME_LENGTH = 20

function toPathSegment(value: string): string {
	return transliterate(value)
		.toLowerCase()
		.trim()
		.replace(/\s+/g, '_')
		.replace(/[^a-z0-9_]/g, '')
		.replace(/_+/g, '_')
}

function toPersonFilename(value: string): string {
	return toPathSegment(value)
}

function normalizePersonName(value: string): string {
	return transliterate(value).replace(/\s+/g, ' ').trim()
}

function toLookupKey(value: string): string {
	return transliterate(value).toLowerCase().trim()
}

function normalizePeopleByCity(
	peopleByCity: Array<{ city: string; person: string }>,
	cities: string[]
): { normalized: Record<string, string>; unknownCities: string[] } {
	const cityLookup = new Map(cities.map((city) => [toLookupKey(city), city]))
	const normalized: Record<string, string> = {}
	const unknownCities: string[] = []

	for (const { city: rawCity, person } of peopleByCity) {
		const city = cityLookup.get(toLookupKey(rawCity))
		if (!city) {
			unknownCities.push(rawCity)
			continue
		}
		normalized[city] = person
	}

	return { normalized, unknownCities: unknownCities.sort((a, b) => a.localeCompare(b)) }
}

function buildCreateActions(
	demand: Record<string, Record<string, number>>,
	sellers: Record<string, string[]>,
	peopleByCity: Record<string, string>
) {
	const cities = Object.keys(demand).sort((a, b) => a.localeCompare(b))
	const goods = Object.keys(sellers).sort((a, b) => a.localeCompare(b))
	const actions: FilesystemAction[] = [
		{ action: 'createDirectory', path: '/miasta' },
		{ action: 'createDirectory', path: '/osoby' },
		{ action: 'createDirectory', path: '/towary' },
	]

	for (const city of cities) {
		actions.push({
			action: 'createFile',
			path: `/miasta/${toPathSegment(city)}`,
			content: JSON.stringify(demand[city]),
		})
	}

	for (const city of cities) {
		const personName = normalizePersonName(peopleByCity[city])
		actions.push({
			action: 'createFile',
			path: `/osoby/${toPersonFilename(personName)}`,
			content: `${personName}\n[${city}](/miasta/${toPathSegment(city)})`,
		})
	}

	for (const good of goods) {
		const sellerLinks = [...sellers[good]]
			.sort((a, b) => a.localeCompare(b))
			.map((city) => `[${city}](/miasta/${toPathSegment(city)})`)
			.join('\n')
		actions.push({
			action: 'createFile',
			path: `/towary/${toPathSegment(good)}`,
			content: sellerLinks,
		})
	}

	return actions
}

function validateActionPaths(actions: FilesystemAction[]): string[] {
	const errors: string[] = []
	const usedNames = new Set<string>()

	for (const action of actions) {
		if (!action.path) continue
		const segments = action.path.split('/').filter(Boolean)
		if (segments.length === 0) continue

		const leaf = segments[segments.length - 1]
		const isDirectory = action.action === 'createDirectory'
		const maxLength = isDirectory ? MAX_DIRECTORY_NAME_LENGTH : MAX_FILE_NAME_LENGTH

		if (!NAME_PATTERN.test(leaf)) {
			errors.push(`Invalid name pattern: ${leaf}`)
		}

		if (leaf.length > maxLength) {
			errors.push(`Name too long: ${leaf}`)
		}

		if (usedNames.has(leaf)) {
			errors.push(`Duplicate global name: ${leaf}`)
		}

		usedNames.add(leaf)
	}

	return errors
}

export const submitFilesystemTool = defineAgentTool({
	name: 'submit_filesystem',
	description:
		'Submit the final filesystem using a dataset handle from preprocess_notes and a city-to-person mapping. This tool resets state, creates directories and files, and runs final verification.',
	schema: z.object({
		datasetId: z.string().describe('Dataset handle returned by preprocess_notes'),
		people: z
			.array(
				z.object({
					city: z.string().describe('Canonical city name, e.g. Brudzewo'),
					person: z.string().describe('Full person name for that city'),
				})
			)
			.describe('List of city-person pairs covering every city exactly once'),
	}),
	handler: async ({ datasetId, people }) => {
		const dataset = getDataset(datasetId)
		if (!dataset) {
			return JSON.stringify({ error: 'Unknown datasetId' })
		}

		const cities = Object.keys(dataset.demand).sort((a, b) => a.localeCompare(b))
		const { normalized, unknownCities } = normalizePeopleByCity(people, cities)
		if (unknownCities.length > 0) {
			return JSON.stringify({ error: 'Unknown cities in people list', unknownCities, expectedCities: cities })
		}

		const missingCities = cities.filter((city) => !normalized[city]?.trim())
		if (missingCities.length > 0) {
			return JSON.stringify({ error: 'Missing people for cities', missingCities })
		}

		const createActions = buildCreateActions(dataset.demand, dataset.sellers, normalized)
		const validationErrors = validateActionPaths(createActions)
		if (validationErrors.length > 0) {
			return JSON.stringify({ error: 'Filesystem name validation failed', details: validationErrors })
		}

		logger.tool('info', 'Submitting filesystem', {
			datasetId,
			cities: cities.length,
			goods: Object.keys(dataset.sellers).length,
			files: createActions.length - 3,
		})

		await verifyAnswer(config, { action: 'reset' })
		const batchResult = await verifyAnswer(config, createActions, { exitOnFlag: false })
		const batchData =
			typeof batchResult.data === 'object' && batchResult.data !== null
				? (batchResult.data as { code?: unknown })
				: null
		const batchCode = typeof batchData?.code === 'number' ? batchData.code : null
		if (typeof batchCode === 'number' && batchCode < 0) {
			return batchResult.responseText
		}
		const result = await verifyAnswer(config, { action: 'done' }, { exitOnFlag: true })

		return result.responseText
	},
})
