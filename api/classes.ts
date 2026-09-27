// USask class sections and live seat counts, for the class tracker. One route, three reads:
//   GET /api/classes?op=terms
//   GET /api/classes?op=search&term=202701&course=CMPT370
//   GET /api/classes?op=seats&term=202701&courses=CMPT370,CMPT280
// Banner is a public university service with no rate-limit contract, so answers are cached briefly
// in the warm function and a seat check is capped at a handful of courses.

import { BannerError, getTerms, searchCourse } from './_banner.js'
import { MAX_WATCHES } from '../src/lib/classTracker.js'

interface VercelRequest {
  method?: string
  query?: Record<string, string | string[] | undefined>
}

interface VercelResponse {
  status: (code: number) => VercelResponse
  setHeader: (name: string, value: string) => void
  json: (body: unknown) => void
}

// As many courses as a student can watch, so no watch is ever left out of a check.
const MAX_SEAT_COURSES = MAX_WATCHES
// Each course opens its own Banner session (three or four requests). Banner throttles bursts by
// answering empty, so only a few run at once.
const SEAT_CONCURRENCY = 3

/** `fn` over every item, at most `limit` at a time, results in input order. */
async function mapLimited<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}
const COURSE_RE = /^([A-Z]{2,5})\s*(\d{2,3}[A-Z]?)$/

const cache = new Map<string, { value: unknown; expiresAt: number }>()
async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key)
  if (hit && hit.expiresAt > Date.now()) return hit.value as T
  const value = await load()
  // An empty answer is usually Banner throttling, so it's never kept.
  if (Array.isArray(value) && value.length === 0) return value
  if (cache.size > 200) cache.clear()
  cache.set(key, { value, expiresAt: Date.now() + ttlMs })
  return value
}

function param(req: VercelRequest, name: string): string {
  const value = req.query?.[name]
  return (Array.isArray(value) ? value[0] : value ?? '').trim()
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'GET only' })
    return
  }

  const op = param(req, 'op')
  const term = param(req, 'term')
  if (op !== 'terms' && !/^\d{6}$/.test(term)) {
    res.status(400).json({ error: 'term required' })
    return
  }

  try {
    if (op === 'terms') {
      res.status(200).json({ terms: await cached('terms', 6 * 60 * 60_000, getTerms) })
      return
    }

    if (op === 'search') {
      const match = param(req, 'course').toUpperCase().match(COURSE_RE)
      if (!match) {
        res.status(400).json({ error: 'course like CMPT 370 required' })
        return
      }
      const [, subject, number] = match
      const sections = await cached(`search:${term}:${subject}${number}`, 60_000, () => searchCourse(term, subject, number))
      res.status(200).json({ sections })
      return
    }

    if (op === 'seats') {
      const courses = [...new Set(param(req, 'courses').toUpperCase().split(','))]
        .map((c) => c.match(COURSE_RE))
        .filter((m): m is RegExpMatchArray => m !== null)
        .slice(0, MAX_SEAT_COURSES)
      const results = await mapLimited(courses, SEAT_CONCURRENCY, async ([, subject, number]) => {
        try {
          return await cached(`seats:${term}:${subject}${number}`, 30_000, () => searchCourse(term, subject, number))
        } catch {
          // One course's hiccup never hides the others; the client keeps its last reading.
          return []
        }
      })
      // An empty list is Banner throttling or a hiccup, not a vanished section: those CRNs are simply
      // missing from the answer, and the client keeps what it had.
      const seats = results.flat().map((section) => ({ crn: section.crn, seats: section }))
      res.status(200).json({ seats, checkedAt: new Date().toISOString() })
      return
    }

    res.status(400).json({ error: 'unknown op' })
  } catch (error) {
    const status = error instanceof BannerError ? 502 : 500
    res.status(status).json({ error: "USask's class search didn't answer" })
  }
}
