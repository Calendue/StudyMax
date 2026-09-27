// "Continue on the web" without signing in: the phone app hands its saved session (courses, this
// term's schedule, plan settings; never a phone number or anything secret) to the website as a link.
// The link carries it in the #hash, which never reaches a server; the site writes it into the guest
// slot before the app reads it (main.tsx) and removes it from the address bar.
const SAVE_KEY = 'studymax:v1'
const PARAM = '#sm='
const SITE = 'https://www.studymax.study/'

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let bin = ''
  bytes.forEach((b) => (bin += String.fromCharCode(b)))
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(text: string): string {
  const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/'))
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))
}

/** The link that opens this device's plan on the website, or null when there's nothing saved yet. */
export function webLinkFor(uid: string | null): string | null {
  try {
    const raw = (uid && localStorage.getItem(`${SAVE_KEY}:${uid}`)) || localStorage.getItem(SAVE_KEY)
    if (!raw) return null
    JSON.parse(raw)
    return `${SITE}${PARAM}${toBase64Url(raw)}`
  } catch {
    return null
  }
}

/** On the website: take a session handed over by the phone app, before the app reads its storage. */
export function importFromLink(): void {
  try {
    if (!location.hash.startsWith(PARAM)) return
    const json = fromBase64Url(location.hash.slice(PARAM.length))
    const state = JSON.parse(json) as unknown
    if (state && typeof state === 'object' && !Array.isArray(state)) localStorage.setItem(SAVE_KEY, JSON.stringify(state))
    history.replaceState(null, '', location.pathname + location.search)
  } catch {
    // a broken link: the site opens as it would have
  }
}
