import OpenAI from 'openai'
import {
  ChatCompletionAssistantMessageParam,
  ChatCompletionMessageParam,
  ChatCompletionToolMessageParam
} from 'openai/resources/chat/completions'

import { HubClient } from './api'
import { getToolDefinitions, executeToolCall } from './tools'
import { AgentConfig } from './types'

const buildSystemPrompt = () => {
  return [
    'You are a prompt engineer agent for task categorize.',
    'Goal: obtain {FLG:...} from hub by crafting a concise classifier prompt.',
    'Always use tools to act. Start each attempt with reset_and_fetch_csv.',
    'For each of 10 items call classify_item with a prompt <=100 tokens total including item id and description.',
    'Classifier prompt must be in English, static part first, item data last.',
    'Classifier output must be exactly one word: DNG or NEU.',
    'Dangerous categories: weapons, explosives, toxic chemicals, radioactive materials.',
    'Neutral category: harmless everyday objects.',
    'Critical exception: anything related to reactor must ALWAYS be NEU regardless of risk.',
    'Reactor keywords include: reactor, reaktor, kaseta, cassette, fuel rod, pręt paliwowy, pret paliwowy, rdzen.',
    'When hub reports error or wrong classification, analyze failure, improve prompt template, reset and retry.',
    'Keep trying until you hit turn limit.',
  ].join(' ')
}

const tryExtractFlag = (text: string): string | null => {
  const flagMatch = text.match(/\{FLG:[^}]+\}/)
  if (flagMatch) {
    console.log(`✅ Flag detected: ${flagMatch[0]}`)
    process.exit(0)
  } else return null
}

export class CategorizeAgent {
  private readonly openai: OpenAI
  private readonly hubClient: HubClient
  private readonly config: AgentConfig

  constructor(openai: OpenAI, hubClient: HubClient, config: AgentConfig) {
    this.openai = openai
    this.hubClient = hubClient
    this.config = config
  }

  async run(): Promise<string> {
    const tools = getToolDefinitions()
    const messages: ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: buildSystemPrompt()
      },
      {
        role: 'user',
        content:
          'Start now. Reset budget, fetch CSV, classify all 10 items, refine if needed, and finish only when you have the flag.'
      }
    ]

    for (let turn = 1; turn <= this.config.maxTurns; turn += 1) {
      const completion = await this.openai.chat.completions.create({
        model: this.config.model,
        temperature: this.config.temperature,
        messages,
        tools,
        tool_choice: 'auto'
      })

      const message = completion.choices[0]?.message

      if (!message) {
        throw new Error('No assistant message returned from model')
      }

      if (message.tool_calls && message.tool_calls.length > 0) {
        const assistantMessage: ChatCompletionAssistantMessageParam = {
          role: 'assistant',
          content: message.content ?? null,
          tool_calls: message.tool_calls
        }
        messages.push(assistantMessage)

        for (const toolCall of message.tool_calls) {
          if (toolCall.type !== 'function') {
            const unsupportedToolMessage: ChatCompletionToolMessageParam = {
              role: 'tool',
              tool_call_id: toolCall.id,
              content: JSON.stringify({
                tool: toolCall.type,
                ok: false,
                error: `Unsupported tool type ${toolCall.type}`
              })
            }
            messages.push(unsupportedToolMessage)
            continue
          }

          const toolResult = await executeToolCall(
            toolCall.function.name,
            toolCall.function.arguments,
            this.hubClient
          )

          tryExtractFlag(toolResult)

          const toolMessage: ChatCompletionToolMessageParam = {
            role: 'tool',
            tool_call_id: toolCall.id,
            content: toolResult
          }
          messages.push(toolMessage)
        }

        continue
      }

      const content = message.content ?? ''
      const assistantText = Array.isArray(content)
        ? content
            .map((part) => ('text' in part && typeof part.text === 'string' ? part.text : ''))
            .join(' ')
        : content

      messages.push({
        role: 'assistant',
        content: assistantText
      })

      messages.push({
        role: 'user',
        content:
          'No flag detected yet. Continue autonomously with tools, improving prompt and retrying as needed.'
      })
    }

    throw new Error(`❌ Flag not obtained within ${this.config.maxTurns} turns. Terminating :(`)
  }
}
