import "dotenv/config"
import { runAgent } from "./agent"

runAgent().catch(console.error)
