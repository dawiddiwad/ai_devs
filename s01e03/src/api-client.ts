import axios from "axios"
import type { PackageApiResponse } from "./types"

const PACKAGES_URL = "https://hub.ag3nts.org/api/packages"

function getApiKey(): string {
  const key = process.env.AI_DEVS_API_KEY
  if (!key) throw new Error("AI_DEVS_API_KEY is not set")
  return key
}

export async function checkPackage(packageid: string): Promise<PackageApiResponse> {
  const { data } = await axios.post<PackageApiResponse>(PACKAGES_URL, {
    apikey: getApiKey(),
    action: "check",
    packageid,
  })
  return data
}

export async function redirectPackage(
  packageid: string,
  destination: string,
  code: string
): Promise<PackageApiResponse> {
  const { data } = await axios.post<PackageApiResponse>(PACKAGES_URL, {
    apikey: getApiKey(),
    action: "redirect",
    packageid,
    destination,
    code,
  })
  return data
}
