import "dotenv/config"
import { runAgentLoop } from "./agent"

const main = async () => {
	console.log("Starting Electricity Puzzle Agent...")
	console.log(`Vision model: ${process.env.VISION_MODEL || "gpt-5-mini"}`)
	console.log(`Agent model: ${process.env.OPENAI_MODEL || "gpt-5-mini"}`)

	const flag = await runAgentLoop()

	if (flag) {
		console.log(`\n✅ ${flag}`)
	} else {
		console.log("\n❌ Failed to solve the puzzle.")
		process.exit(1)
	}
}

main().catch((error) => {
	console.error("Fatal error:", error)
	process.exit(1)
})
