import OpenAI from 'openai'
import { zodFunction } from 'openai/helpers/zod'
import { z } from 'zod/v4'
import { config } from './config'
import { CatalogItem } from './catalog'

const MatchResultSchema = z.object({
	itemCode: z.string().describe("Exact code of the best matching item from the list, or 'NONE' if nothing matches"),
})

const SYSTEM_PROMPT =
	'You are a parts catalog assistant. Given a natural language query and a list of items, identify which item best matches the query. Return the exact item code. Return NONE if nothing matches.'

export type ItemMatcher = (query: string, candidates: CatalogItem[]) => Promise<CatalogItem | null>

export function createItemMatcher(): ItemMatcher {
	const client = new OpenAI({ apiKey: config.openaiApiKey, baseURL: config.openaiBaseUrl })

	return async function matchItem(query: string, candidates: CatalogItem[]): Promise<CatalogItem | null> {
		const candidateList = candidates.map((c) => `${c.code}: ${c.name}`).join('\n')

		const response = await client.chat.completions.parse({
			model: config.openaiModel,
			messages: [
				{ role: 'system', content: SYSTEM_PROMPT },
				{ role: 'user', content: `Query: "${query}"\n\nAvailable items:\n${candidateList}` },
			],
			tools: [zodFunction({ name: 'match_item', parameters: MatchResultSchema })],
			tool_choice: 'required',
		})

		const parsed = response.choices[0].message.tool_calls?.[0]?.function.parsed_arguments as
			| z.infer<typeof MatchResultSchema>
			| undefined

		if (!parsed || parsed.itemCode === 'NONE') return null

		return candidates.find((item) => item.code === parsed.itemCode) ?? null
	}
}
