import dotenv from 'dotenv'
import OpenAI from 'openai'

import { CategorizeAgent } from './agent'
import { HubClient } from './api'

dotenv.config()

const main = async () => {
  const hubApiKey = process.env.API_KEY ?? process.env.AI_DEVS_API_KEY
  if (!hubApiKey) {
    throw new Error('Missing required environment variable: API_KEY or AI_DEVS_API_KEY')
  }
  const openAiApiKey = process.env.OPENAI_API_KEY
  if (!openAiApiKey) {
    throw new Error('Missing required environment variable: OPENAI_API_KEY')
  }

  const taskName = process.env.AI_DEVS_TASK_NAME ?? 'categorize'
  const model = process.env.OPENAI_MODEL ?? 'gpt-5-mini'
  const baseURL = process.env.OPENAI_BASE_URL
  const maxTurns = process.env.AGENT_MAX_TURNS ? Number(process.env.AGENT_MAX_TURNS) : 20
  const temperature = process.env.OPENAI_TEMPERATURE ? Number(process.env.OPENAI_TEMPERATURE) : undefined

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
    maxTurns
  })

  const flag = await agent.run()
  console.log(flag)
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : 'Unknown error'
  console.error(message)
  process.exitCode = 1
})
