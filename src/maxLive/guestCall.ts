// A guest's Max details — the number to ring, consent to ring it, and the name Max uses — for this
// browser tab only. Every guest shares the one seeded demo student on the server, so none of this may
// live there: it would reach the next guest (Ping Max rang the last guest's phone; Max greeted the
// next one by the last one's name). The app sends it with each call (api/max/call.ts).

const KEY = 'studymax.maxGuestCall'

export interface GuestCall {
  phoneE164?: string
  consent: boolean
  name?: string
}

export function readGuestCall(): GuestCall | null {
  try {
    const g = JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as GuestCall | null
    return g && typeof g === 'object' ? g : null
  } catch {
    return null
  }
}

export function writeGuestCall(next: GuestCall | null) {
  try {
    if (next) sessionStorage.setItem(KEY, JSON.stringify(next))
    else sessionStorage.removeItem(KEY)
  } catch {
    // storage blocked: they'll just confirm their details again next time
  }
}

/** Merges into what's there. */
export function updateGuestCall(patch: Partial<GuestCall>) {
  writeGuestCall({ consent: false, ...readGuestCall(), ...patch })
}

export const lastFour = (phone: string) => phone.replace(/\D/g, '').slice(-4)
