import type { SessionHistory } from "./types"

const store = new Map<string, SessionHistory>()

export function getSession(sessionID: string): SessionHistory {
  if (!store.has(sessionID)) {
    store.set(sessionID, [])
  }
  return store.get(sessionID)!
}
