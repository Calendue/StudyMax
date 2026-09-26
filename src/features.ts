import { api } from './platform.ts'

// Features that need a server key. api/features.ts reports which keys the deployment has; anything
// it can't run is left out of the app rather than failing when the student reaches it.
export interface Features {
  /** Transcript reading, "why you" notes, and guidance for schools we haven't mapped (Anthropic). */
  ai: boolean
  /** The phone call about the award closing soonest (Bland). */
  call: boolean
}

const OFF: Features = { ai: false, call: false }
const CACHE_KEY = 'studymax:features'

/** The last answer this device saw, so a relaunch doesn't flicker features in; off on first launch. */
export function cachedFeatures(): Features {
  try {
    const parsed = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null')
    return parsed ? { ai: parsed.ai === true, call: parsed.call === true } : OFF
  } catch {
    return OFF
  }
}

/**
 * Asks the deployment. A 404 (plain `vite` dev, or a deployment from before this route) means off.
 * A network failure returns null: keep what we had, since those features can't reach the server
 * right now anyway and will say so themselves.
 */
export async function fetchFeatures(): Promise<Features | null> {
  try {
    const res = await fetch(api('/api/features'), { cache: 'no-store' })
    const data = res.ok ? await res.json().catch(() => OFF) : OFF
    const features: Features = { ai: data.ai === true, call: data.call === true }
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(features))
    } catch {
      // storage blocked: fine, we'll ask again next launch
    }
    return features
  } catch {
    return null
  }
}
