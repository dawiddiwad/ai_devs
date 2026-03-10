import * as fs from "fs"
import * as path from "path"
import { VerifyAnswer } from "./types"
import { submitVerification } from "./api-client"

export function saveResult(answer: VerifyAnswer): void {
  const outputDir = path.join(__dirname, "..", "output")
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir)
  }
  fs.writeFileSync(
    path.join(outputDir, "matched-suspect.json"),
    JSON.stringify(answer, null, 2)
  )
  console.log("Saved output/matched-suspect.json:", JSON.stringify(answer, null, 2))
}

export async function verify(answer: VerifyAnswer): Promise<unknown> {
  const result = await submitVerification(answer)
  console.log("Verification result:", JSON.stringify(result, null, 2))
  return result
}
