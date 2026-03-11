import express from "express"
import { runAgent } from "./agent"
import type { ProxyRequest } from "./types"

export function createServer() {
  const app = express()

  app.use(express.json())

  app.use((req, res, next) => {
    const timestamp = new Date().toISOString()
    console.log(`\n${"=".repeat(60)}`)
    console.log(`[${timestamp}] ${req.method} ${req.url}`)
    console.log(`[Headers] ${JSON.stringify(req.headers, null, 2)}`)
    if (req.body && Object.keys(req.body).length > 0) {
      console.log(`[Body] ${JSON.stringify(req.body)}`)
    }
    console.log(`${"=".repeat(60)}`)
    next()
  })

  app.get("/", (_req, res) => {
    console.log(`[Response] 200 OK (health check)`)
    res.json({ status: "ok" })
  })

  app.post("/", async (req, res) => {
    const body = req.body as Partial<ProxyRequest>

    if (!body.sessionID || !body.msg) {
      console.log(`[Response] 400 - Missing sessionID or msg`)
      res.status(400).json({ error: "Missing sessionID or msg" })
      return
    }

    console.log(`\n>>> [${body.sessionID}] User: ${body.msg}`)

    try {
      const reply = await runAgent(body.sessionID, body.msg)
      console.log(`<<< [${body.sessionID}] Agent: ${reply}`)
      res.json({ msg: reply })
    } catch (error) {
      console.error(`[${body.sessionID}] Error:`, error)
      res.status(500).json({ msg: "Wystąpił błąd wewnętrzny. Spróbuj ponownie." })
    }
  })

  return app
}
