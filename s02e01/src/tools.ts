import { ChatCompletionFunctionTool } from 'openai/resources/chat/completions/completions'
import { HubClient } from './api'
import { ToolResultEnvelope } from './types'
import strict from 'node:assert/strict'

const tryParseJson = (value: string): Record<string, unknown> => {
  try {
    return JSON.parse(value) as Record<string, unknown>
  } catch {
    return {}
  }
}

export const tools: ChatCompletionFunctionTool[] = [
    {
      type: 'function' as const,
      function: {
        name: 'reset_and_fetch_csv',
        description:
          'Resets token budget at the hub and fetches fresh categorize CSV with 10 items',
        parameters: {
          type: 'object',
          properties: {},
          additionalProperties: false
        },
        strict: true
      }
    },
    {
      type: 'function' as const,
      function: {
        name: 'classify_item',
        description:
          'Sends one classification prompt to hub verify endpoint and returns raw JSON response',
        parameters: {
          type: 'object',
          properties: {
            prompt: {
              type: 'string',
              description:
                'Full prompt under 100 tokens including item id and item description. Must output exactly DNG or NEU'
            }
          },
          required: ['prompt'],
          additionalProperties: false
        },
        strict: true
      }
    }
]

export const executeTool = async (
  name: string,
  parameters: string,
  hubClient: HubClient
): Promise<string> => {
  const args = tryParseJson(parameters)

  const buildResult = (result: ToolResultEnvelope): string => {
    const serialized = JSON.stringify(result)
    console.log(`[tool:${name}] ${serialized}`)
    return serialized
  }

  if (name === 'reset_and_fetch_csv') {
    try {
      const data = await hubClient.resetAndFetchCsv()
      return buildResult({
        tool: name,
        ok: true,
        data
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown reset/fetch error'
      return buildResult({
        tool: name,
        ok: false,
        error: message
      })
    }
  }

  if (name === 'classify_item') {
    const prompt = typeof args.prompt === 'string' ? args.prompt : ''

    if (prompt.length === 0) {
      return buildResult({
        tool: name,
        ok: false,
        error: 'Missing prompt argument'
      })
    }

    try {
      const data = await hubClient.classifyPrompt(prompt)
      return buildResult({
        tool: name,
        ok: true,
        data
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown classify error'
      return buildResult({
        tool: name,
        ok: false,
        error: message
      })
    }
  }

  return buildResult({
    tool: name,
    ok: false,
    error: `Unknown tool ${name}`
  })
}
