// A small fixed-window rate limiter for the routes that cost money (OpenAI, Bland). It lives in the
// warm function's memory, so it resets on a cold start and each instance counts on its own: it is a
// brake on scripted abuse, not an exact quota. Limits are generous per IP on purpose, because a
// hackathon venue puts every judge and teammate behind one address.

interface RequestLike {
  headers?: Record<string, string | string[] | undefined>
}

const windows = new Map<string, { count: number; resetAt: number }>()

/** The caller's address as Vercel reports it, or a shared bucket when there isn't one. */
export function clientIp(req: RequestLike): string {
  const header = (name: string) => {
    const value = req.headers?.[name]
    return (Array.isArray(value) ? value[0] : value) ?? ''
  }
  return header('x-forwarded-for').split(',')[0].trim() || header('x-real-ip').trim() || 'unknown'
}

/** Counts one hit against `key` and says whether it is still within `limit` per `windowMs`. */
export function allow(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now()
  if (windows.size > 5000) {
    for (const [k, w] of windows) if (w.resetAt <= now) windows.delete(k)
  }
  const current = windows.get(key)
  if (!current || current.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }
  current.count++
  return current.count <= limit
}
