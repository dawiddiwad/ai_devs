import type { ChatCompletionMessageParam } from "openai/resources/chat/completions"

export interface ProxyRequest {
  sessionID: string
  msg: string
}

export interface ProxyResponse {
  msg: string
}

export type SessionHistory = ChatCompletionMessageParam[]

export interface PackageCheckPayload {
  apikey: string
  action: "check"
  packageid: string
}

export interface PackageRedirectPayload {
  apikey: string
  action: "redirect"
  packageid: string
  destination: string
  code: string
}

export interface PackageApiResponse {
  [key: string]: unknown
}
