import { defineAgentTool, logger } from '@ai-devs/core'
import { z } from 'zod/v4'
import type { PersonHintsMap } from '../pipeline/types.js'
import { runPipeline } from '../pipeline/index.js'
import { saveDataset } from './preprocess-store.js'

function splitPeople(personHints: PersonHintsMap) {
	const resolvedPeople: Record<string, string> = {}
	const unresolvedPeople: Array<{ city: string; names: string[]; snippets: string[] }> = []

	for (const city of Object.keys(personHints).sort((a, b) => a.localeCompare(b))) {
		const hint = personHints[city]
		if (hint.fullNames.length === 1) {
			resolvedPeople[city] = hint.fullNames[0]
			continue
		}
		unresolvedPeople.push({
			city,
			names: hint.fullNames,
			snippets: hint.snippets,
		})
	}

	return { resolvedPeople, unresolvedPeople }
}

export const preprocessNotesTool = defineAgentTool({
	name: 'preprocess_notes',
	description:
		"Run local preprocessing on Natan's notes. Stores the parsed trade data locally and returns only a dataset handle, already resolved people, and unresolved city snippets for the LLM.",
	schema: z.object({
		rawNotesText: z.string().describe('The full text output from download_notes'),
	}),
	handler: async ({ rawNotesText }) => {
		logger.tool('info', 'Running local preprocessing pipeline')
		const tradeMap = runPipeline(rawNotesText)
		const datasetId = saveDataset({
			demand: tradeMap.demand,
			sellers: tradeMap.sellers,
		})
		const { resolvedPeople, unresolvedPeople } = splitPeople(tradeMap.personHints)
		const summary = JSON.stringify({
			datasetId,
			resolvedPeople,
			unresolvedPeople,
		})
		logger.tool('info', 'Pipeline complete', {
			cities: Object.keys(tradeMap.demand).length,
			goods: Object.keys(tradeMap.sellers).length,
			personHints: Object.values(tradeMap.personHints).reduce(
				(sum, hint) => sum + hint.fullNames.length + hint.snippets.length,
				0
			),
			rawChars: rawNotesText.length,
			summaryChars: summary.length,
			unresolvedCities: unresolvedPeople.length,
		})
		return summary
	},
})
