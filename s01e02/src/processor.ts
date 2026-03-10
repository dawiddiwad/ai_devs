import * as fs from "fs"
import * as path from "path"
import axios from "axios"
import { Coordinates, MatchResult, PowerPlant, Suspect, SuspectsFile } from "./types"
import { fetchPowerPlantsRaw, fetchSuspectLocations } from "./api-client"
import { haversineDistance } from "./geo"

async function geocodeCity(city: string): Promise<Coordinates> {
  const { data } = await axios.get<Array<{ lat: string, lon: string }>>(
    "https://nominatim.openstreetmap.org/search",
    {
      params: { q: `${city}, Poland`, format: "json", limit: 1 },
      headers: { "User-Agent": "ai-devs-task/1.0" },
    }
  )
  if (!data.length) {
    throw new Error(`Geocoding failed for city: ${city}`)
  }
  return { latitude: parseFloat(data[0].lat), longitude: parseFloat(data[0].lon) }
}

export function loadSuspects(): Suspect[] {
  const raw = fs.readFileSync(
    path.join(__dirname, "..", "input", "suspects.json"),
    "utf-8"
  )
  const parsed: SuspectsFile = JSON.parse(raw)
  return parsed.answer
}

export async function fetchPowerPlants(): Promise<PowerPlant[]> {
  const response = await fetchPowerPlantsRaw()

  const entries = Object.entries(response.power_plants)
  const plants: PowerPlant[] = []

  for (const [city, info] of entries) {
    const coords = await geocodeCity(city)
    plants.push({
      code: info.code,
      city,
      latitude: coords.latitude,
      longitude: coords.longitude,
    })
  }

  return plants
}

function findClosestPlant(
  locations: Coordinates[],
  plants: PowerPlant[]
): { plant: PowerPlant, distance: number } | null {
  let best: { plant: PowerPlant, distance: number } | null = null

  for (const loc of locations) {
    for (const plant of plants) {
      const dist = haversineDistance(loc, {
        latitude: plant.latitude,
        longitude: plant.longitude,
      })
      if (!best || dist < best.distance) {
        best = { plant, distance: dist }
      }
    }
  }

  return best
}

export async function findSuspectNearPlant(
  suspects: Suspect[],
  plants: PowerPlant[]
): Promise<MatchResult | null> {
  let bestMatch: MatchResult | null = null

  for (const suspect of suspects) {
    const locations = await fetchSuspectLocations(suspect.name, suspect.surname)

    if (!locations || locations.length === 0) {
      console.log(`No locations found for ${suspect.name} ${suspect.surname}`)
      continue
    }

    const closest = findClosestPlant(locations, plants)

    console.log(
      `${suspect.name} ${suspect.surname}: closest plant = ${closest?.plant.city} (${closest?.plant.code}) at ${closest?.distance.toFixed(2)} km`
    )

    if (closest && (!bestMatch || closest.distance < bestMatch.distance)) {
      bestMatch = {
        suspect,
        plant: closest.plant,
        distance: closest.distance,
      }
    }
  }

  return bestMatch
}
