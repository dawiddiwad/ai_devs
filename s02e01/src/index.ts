import dotenv from 'dotenv'
import OpenAI from 'openai'

import { CategorizeAgent } from './agent'
import { HubClient } from './api'

dotenv.config()

const requireEnv = (name: string, fallback?: string): string => {
  const primaryValue = process.env[name]
  if (primaryValue && primaryValue.trim().length > 0) {
    return primaryValue
  }

  if (fallback) {
    const fallbackValue = process.env[fallback]
    if (fallbackValue && fallbackValue.trim().length > 0) {
      return fallbackValue
    }
  }

  throw new Error(`Missing required environment variable: ${name}${fallback ? ` or ${fallback}` : ''}`)
}

const parseTemperature = (value: string | undefined): number | undefined => {
  if (!value) {
    return undefined
  }

  const parsed = Number(value)
  if (Number.isNaN(parsed)) {
    return undefined
  }

  return parsed
}

const main = async () => {
  const hubApiKey = requireEnv('API_KEY', 'AI_DEVS_API_KEY')
  const openAiApiKey = requireEnv('OPENAI_API_KEY')
  const taskName = process.env.AI_DEVS_TASK_NAME ?? 'categorize'
  const model = process.env.OPENAI_MODEL ?? 'gpt-5-mini'
  const baseURL = process.env.OPENAI_BASE_URL
  const temperature = parseTemperature(process.env.OPENAI_TEMPERATURE)

  const hubClient = new HubClient({
    apiKey: hubApiKey,
    taskName,
    verifyUrl: 'https://***hub_endpoint***/verify',
    dataUrl: `https://***hub_endpoint***/data/${hubApiKey}/categorize.csv`
  })

  const openai = new OpenAI({
    apiKey: openAiApiKey,
    baseURL
  })

  const agent = new CategorizeAgent(openai, hubClient, {
    model,
    temperature,
    maxTurns: process.env.AGENT_MAX_TURNS ? Number(process.env.AGENT_MAX_TURNS) : 20
  })

  const flag = await agent.run()
  console.log(flag)
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : 'Unknown error'
  console.error(message)
  process.exitCode = 1
})
