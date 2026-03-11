import dotenv from "dotenv"
dotenv.config()

import { createServer } from "./server"

const PORT = parseInt(process.env.PORT || "3000", 10)

const app = createServer()

app.listen(PORT, () => {
  console.log(`Proxy server listening on port ${PORT}`)
})
