import dotenv from "dotenv"
import OpenAI from "openai"
import { RailwayApiClient } from "./api-client"
import { Agent } from "./agent"

dotenv.config()

async function main(): Promise<void> {
  const aiDevsApiKey = process.env.AI_DEVS_API_KEY
  const openaiApiKey = process.env.OPENAI_API_KEY

  if (!aiDevsApiKey) {
    throw new Error("AI_DEVS_API_KEY environment variable is not set")
  }

  if (!openaiApiKey) {
    throw new Error("OPENAI_API_KEY environment variable is not set")
  }

  const openai = new OpenAI({ apiKey: openaiApiKey })
  const apiClient = new RailwayApiClient(aiDevsApiKey)
  const agent = new Agent(openai, apiClient)

  const flag = await agent.run()
  console.log(`\nResult: ${flag}`)
}

main().catch((error) => {
  console.error("Fatal error:", error)
  process.exit(1)
})
