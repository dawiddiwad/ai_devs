import axios from "axios"
import { Coordinates, PowerPlantsResponse, VerifyAnswer } from "./types"

const BASE_URL = "https://***hub_endpoint***"
const API_KEY = process.env.AI_DEVS_API_KEY!

export async function fetchPowerPlantsRaw(): Promise<PowerPlantsResponse> {
  const { data } = await axios.get<PowerPlantsResponse>(
    `${BASE_URL}/data/${API_KEY}/findhim_locations.json`
  )
  return data
}

export async function fetchSuspectLocations(
  name: string,
  surname: string
): Promise<Coordinates[]> {
  const { data } = await axios.post<Coordinates[]>(
    `${BASE_URL}/api/location`,
    { apikey: API_KEY, name, surname }
  )
  return data
}

export async function fetchAccessLevel(
  name: string,
  surname: string,
  birthYear: number
): Promise<number> {
  const { data } = await axios.post<{ accessLevel: number }>(
    `${BASE_URL}/api/accesslevel`,
    { apikey: API_KEY, name, surname, birthYear }
  )
  return data.accessLevel
}

export async function submitVerification(
  answer: VerifyAnswer
): Promise<unknown> {
  const { data } = await axios.post(`${BASE_URL}/verify`, {
    apikey: API_KEY,
    task: "findhim",
    answer,
  })
  return data
}
