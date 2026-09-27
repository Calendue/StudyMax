import { idToken } from './auth.ts'
import type { CloudSession } from './lib/cloudSession.ts'
import { api } from './platform.ts'

// The app's side of /api/session. Everything here is best-effort: the device's own saved session is
// what the app runs from, so a failed load or save (offline, no database, a cold start) changes
// nothing the student sees. It only fills in a session on a phone that has none yet.

async function request(method: 'GET' | 'PUT', body?: CloudSession, timeoutMs = 5000): Promise<Response | null> {
  const token = await idToken()
  if (!token) return null
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(api('/api/session'), {
      method,
      signal: controller.signal,
      headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * The signed-in student's stored session (`session: null` when they have none yet), or null when the
 * database couldn't be reached. The two differ on purpose: only an answer means it's safe to save
 * over what's stored, so an unreachable database never gets an empty session written over a real one.
 */
export async function loadCloudSession(): Promise<{ session: CloudSession | null } | null> {
  const res = await request('GET', undefined, 4000)
  if (!res?.ok) return null
  const data = (await res.json().catch(() => null)) as { session?: CloudSession | null } | null
  return data && 'session' in data ? { session: data.session ?? null } : null
}

export async function saveCloudSession(session: CloudSession): Promise<void> {
  await request('PUT', session)
}
