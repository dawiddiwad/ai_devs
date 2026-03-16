import axios from 'axios'

import { parseCategorizeCsv } from './parser'
import { CargoItem, HubClientConfig, HubResetResponse, HubVerifyPayload } from './types'

export class HubClient {
  private readonly apiKey: string
  private readonly taskName: string
  private readonly verifyUrl: string
  private readonly dataUrl: string

  constructor(config: HubClientConfig) {
    this.apiKey = config.apiKey
    this.taskName = config.taskName
    this.verifyUrl = config.verifyUrl
    this.dataUrl = config.dataUrl
  }

  private async postVerify(prompt: string): Promise<unknown> {
    const payload: HubVerifyPayload = {
      apikey: this.apiKey,
      task: this.taskName,
      answer: {
        prompt
      }
    }

    const response = await axios.post(this.verifyUrl, payload, {
      validateStatus: () => true
    })

    if (response.data && typeof response.data === 'object') {
      return {
        ...(response.data as Record<string, unknown>),
        http_status: response.status
      }
    }

    return {
      http_status: response.status,
      body: response.data
    }
  }

  async resetBudget(): Promise<HubResetResponse> {
    const result = await this.postVerify('reset')
    return result as HubResetResponse
  }

  async fetchCsvItems(): Promise<CargoItem[]> {
    const response = await axios.get<string>(this.dataUrl)
    return parseCategorizeCsv(response.data)
  }

  async classifyPrompt(prompt: string): Promise<unknown> {
    return this.postVerify(prompt)
  }

  async resetAndFetchCsv(): Promise<{ reset: HubResetResponse; items: CargoItem[] }> {
    const reset = await this.resetBudget()
    const items = await this.fetchCsvItems()

    return {
      reset,
      items
    }
  }
}
