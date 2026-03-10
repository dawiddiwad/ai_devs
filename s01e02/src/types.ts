export interface Suspect {
  name: string
  surname: string
  gender: string
  born: number
  city: string
  tags: string[]
}

export interface SuspectsFile {
  apikey: string
  task: string
  answer: Suspect[]
}

export interface PowerPlantRaw {
  is_active: boolean
  power: string
  code: string
}

export interface PowerPlantsResponse {
  power_plants: Record<string, PowerPlantRaw>
}

export interface PowerPlant {
  code: string
  city: string
  latitude: number
  longitude: number
}

export interface Coordinates {
  latitude: number
  longitude: number
}

export interface MatchResult {
  suspect: Suspect
  plant: PowerPlant
  distance: number
}

export interface VerifyAnswer {
  name: string
  surname: string
  accessLevel: number
  powerPlant: string
}
