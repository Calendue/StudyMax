// Listens to a Max call's live channel over Supabase Realtime Broadcast. supabase-js is imported
// lazily, so it only loads when a call actually starts. No Supabase auth: the channel is public and
// its name is the call's unguessable token, which only this app got back from /api/max/call.
import { liveTopic, type LiveEvent } from '../lib/max/live.ts'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

export type ChannelState = 'subscribed' | 'failed' | 'closed'

export interface LiveChannel {
  close(): void
}

/** Whether this build can use Realtime at all (else the hook polls). */
export const realtimeConfigured = Boolean(url && key)

/**
 * Subscribes to the call's channel. `onState('subscribed')` fires on every (re)join, so the caller can
 * catch up from the snapshot then; 'failed' means fall back to polling. Returns null when not configured.
 */
export async function openLiveChannel(
  token: string,
  onEvent: (event: LiveEvent) => void,
  onState: (state: ChannelState) => void,
): Promise<LiveChannel | null> {
  if (!url || !key) return null
  const { createClient } = await import('@supabase/supabase-js')
  // No auth session at all: it would otherwise touch localStorage and read tokens from the URL.
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
  const channel = client
    .channel(liveTopic(token), { config: { broadcast: { self: false } } })
    .on('broadcast', { event: '*' }, (message) => {
      const payload = message.payload as LiveEvent | undefined
      if (payload && typeof payload.type === 'string') onEvent(payload)
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') onState('subscribed')
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') onState('failed')
      else if (status === 'CLOSED') onState('closed')
    })
  return {
    close() {
      void client.removeChannel(channel)
      void client.removeAllChannels()
    },
  }
}
