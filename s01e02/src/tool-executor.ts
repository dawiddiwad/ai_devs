import { loadSuspects, fetchPowerPlants } from "./processor"
import { fetchSuspectLocations, fetchAccessLevel } from "./api-client"
import { haversineDistance } from "./geo"
import { saveResult, verify } from "./verifier"

export async function executeTool(name: string, args: Record<string, unknown>): Promise<string> {
  switch (name) {
    case "load_suspects": {
      const suspects = loadSuspects()
      return JSON.stringify(suspects)
    }

    case "fetch_power_plants": {
      const plants = await fetchPowerPlants()
      return JSON.stringify(plants)
    }

    case "get_suspect_locations": {
      const suspects = args.suspects as Array<{ name: string, surname: string }>
      const results = await Promise.all(
        suspects.map(async (s) => {
          const locations = await fetchSuspectLocations(s.name, s.surname)
          return { name: s.name, surname: s.surname, locations }
        })
      )
      return JSON.stringify(results)
    }

    case "calculate_distances": {
      const pairs = args.pairs as Array<{ label?: string, lat1: number, lon1: number, lat2: number, lon2: number }>
      const results = pairs.map((p) => ({
        label: p.label ?? null,
        distance_km: haversineDistance(
          { latitude: p.lat1, longitude: p.lon1 },
          { latitude: p.lat2, longitude: p.lon2 }
        ),
      }))
      return JSON.stringify(results)
    }

    case "find_nearest_suspect_to_plant": {
      const suspects = args.suspects as Array<{ name: string, surname: string, locations: Array<{ latitude: number, longitude: number }> }>
      const plants = args.plants as Array<{ code: string, city?: string, latitude: number, longitude: number }>
      let best: { name: string, surname: string, plantCode: string, plantCity: string | undefined, distance_km: number } | null = null
      for (const suspect of suspects) {
        for (const loc of suspect.locations) {
          for (const plant of plants) {
            const dist = haversineDistance(loc, { latitude: plant.latitude, longitude: plant.longitude })
            if (!best || dist < best.distance_km) {
              best = {
                name: suspect.name,
                surname: suspect.surname,
                plantCode: plant.code,
                plantCity: plant.city,
                distance_km: dist,
              }
            }
          }
        }
      }
      return JSON.stringify(best)
    }

    case "get_access_level": {
      const level = await fetchAccessLevel(
        args.name as string,
        args.surname as string,
        args.birthYear as number
      )
      return JSON.stringify({ accessLevel: level })
    }

    case "save_and_verify": {
      const answer = {
        name: args.name as string,
        surname: args.surname as string,
        accessLevel: args.accessLevel as number,
        powerPlant: args.powerPlant as string,
      }
      saveResult(answer)
      const result = await verify(answer)
      return JSON.stringify(result)
    }

    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` })
  }
}
