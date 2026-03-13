import axios, { AxiosError } from "axios"
import { ApiRequestBody, ApiResponse, ToolCallInput } from "./types"

const API_ENDPOINT = "https://***hub_endpoint***/verify"
const TASK_NAME = "railway"
const MAX_RETRIES = 5
const INITIAL_BACKOFF_MS = 1000

export class RailwayApiClient {
  private apiKey: string
  private nextAllowedRequestTime: number = 0

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  async callApi(input: ToolCallInput): Promise<ApiResponse> {
    await this.waitForRateLimit()

    const body: ApiRequestBody = {
      apikey: this.apiKey,
      task: TASK_NAME,
      answer: {
        action: input.action,
        ...input.params,
      },
    }

    return this.executeWithRetry(body)
  }

  private async executeWithRetry(body: ApiRequestBody, attempt = 0): Promise<ApiResponse> {
    const timestamp = new Date().toISOString()
    console.log(`[${timestamp}] REQUEST: POST ${API_ENDPOINT}`)
    console.log(`[${timestamp}] BODY: ${JSON.stringify(body, null, 2)}`)

    try {
      const response = await axios.post(API_ENDPOINT, body, {
        headers: { "Content-Type": "application/json" },
        validateStatus: () => true,
      })

      const responseTimestamp = new Date().toISOString()
      console.log(`[${responseTimestamp}] RESPONSE STATUS: ${response.status}`)
      console.log(`[${responseTimestamp}] RESPONSE HEADERS: ${JSON.stringify(response.headers, null, 2)}`)
      console.log(`[${responseTimestamp}] RESPONSE BODY: ${JSON.stringify(response.data, null, 2)}`)

      this.updateRateLimitFromHeaders(response.headers)

      if (response.status === 503 && attempt < MAX_RETRIES) {
        const backoffMs = INITIAL_BACKOFF_MS * Math.pow(2, attempt)
        console.log(`[${responseTimestamp}] 503 received, retrying in ${backoffMs}ms (attempt ${attempt + 1}/${MAX_RETRIES})`)
        await this.sleep(backoffMs)
        return this.executeWithRetry(body, attempt + 1)
      }

      return {
        status: response.status,
        data: response.data,
        rateLimitReset: this.nextAllowedRequestTime > Date.now() ? this.nextAllowedRequestTime : null,
      }
    } catch (error) {
      if (error instanceof AxiosError && !error.response && attempt < MAX_RETRIES) {
        const backoffMs = INITIAL_BACKOFF_MS * Math.pow(2, attempt)
        console.log(`[${new Date().toISOString()}] Network error, retrying in ${backoffMs}ms (attempt ${attempt + 1}/${MAX_RETRIES})`)
        await this.sleep(backoffMs)
        return this.executeWithRetry(body, attempt + 1)
      }
      throw error
    }
  }

  private updateRateLimitFromHeaders(headers: Record<string, unknown>): void {
    const retryAfter = headers["retry-after"]
    if (retryAfter) {
      const seconds = parseInt(String(retryAfter), 10)
      if (!isNaN(seconds)) {
        this.nextAllowedRequestTime = Date.now() + seconds * 1000
        return
      }
    }

    const rateLimitReset =
      headers["x-ratelimit-reset"] ??
      headers["ratelimit-reset"] ??
      headers["x-rate-limit-reset"]

    if (rateLimitReset) {
      const resetValue = parseInt(String(rateLimitReset), 10)
      if (!isNaN(resetValue)) {
        const resetTime = resetValue > 1_000_000_000_000 ? resetValue : resetValue * 1000
        this.nextAllowedRequestTime = resetTime > Date.now() ? resetTime : Date.now() + resetValue * 1000
      }
    }
  }

  private async waitForRateLimit(): Promise<void> {
    const now = Date.now()
    if (this.nextAllowedRequestTime > now) {
      const waitMs = this.nextAllowedRequestTime - now + 100
      console.log(`[${new Date().toISOString()}] Rate limit: waiting ${waitMs}ms before next request`)
      await this.sleep(waitMs)
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
