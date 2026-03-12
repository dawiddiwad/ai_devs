import "dotenv/config"
import { runAgent } from "./agent"

async function main() {
  console.log("=== SPK Transport Declaration Agent ===\n")

  if (!process.env.OPENAI_API_KEY) {
    console.error("Missing OPENAI_API_KEY in .env")
    process.exit(1)
  }
  if (!process.env.AI_DEVS_API_KEY && !process.env.HUB_API_KEY) {
    console.error("Missing AI_DEVS_API_KEY or HUB_API_KEY in .env")
    process.exit(1)
  }

  const result = await runAgent()
  console.log(`\nResult: ${result}`)
}

main().catch((err) => {
  console.error("Fatal error:", err)
  process.exit(1)
})
