// Publishes Max's live events to the app over Supabase Realtime Broadcast, via its REST endpoint (no
// supabase-js on the server). The topic is the call's unguessable liveToken, so only the app that
// placed the call can listen. Never throws and never holds a tool call up for long: a missed event
// is caught up by the app's snapshot read (api/max/live.ts), which is the source of truth.
import type { LiveEvent } from '../../src/lib/max/live.js'
import { liveTopic } from '../../src/lib/max/live.js'

const TIMEOUT_MS = 1500
// The app counts as watching when it read the snapshot this recently (it heartbeats every 10 s).
const VISIBLE_WINDOW_MS = 25_000

/** Distributes Omit across the union, so each event keeps its own fields. */
type EventBody = LiveEvent extends infer E ? (E extends LiveEvent ? Omit<E, 'seq'> : never) : never

export async function publish(token: string | null | undefined, event: EventBody): Promise<void> {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY
  if (!token || !url || !key || process.env.MAX_LIVE === 'off') return

  const headers: Record<string, string> = { 'content-type': 'application/json', apikey: key }
  // A legacy service_role key is a JWT and wants the Bearer header too; the new sb_secret_ keys don't.
  if (key.startsWith('eyJ')) headers.authorization = `Bearer ${key}`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(`${url.replace(/\/$/, '')}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        messages: [{ topic: liveTopic(token), event: event.type, payload: { ...event, seq: Date.now() }, private: false }],
      }),
      signal: controller.signal,
    })
    if (!res.ok) console.error(`[Max] live publish ${event.type} -> ${res.status}`)
  } catch (e) {
    console.error(`[Max] live publish ${event.type} failed`, (e as { name?: string })?.name ?? e)
  } finally {
    clearTimeout(timer)
  }
}

/** Whether the app is on screen for this call right now (spec 07's uiVisible). */
export function uiVisible(call: { uiSeenAt: Date | null } | null | undefined): boolean {
  return Boolean(call?.uiSeenAt && Date.now() - call.uiSeenAt.getTime() < VISIBLE_WINDOW_MS)
}
