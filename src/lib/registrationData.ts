import { api } from '../platform.ts'
import type { Section, Term } from './classTracker.ts'
import { sectionsFor } from './mockRegistration.ts'
import { placeSchedule, type ElectiveSlot, type RegPlan, type RegRequest } from './registration.ts'

// Real class registration, the network part: the sections of every course a RegRequest names, from
// USask's public class search through /api/classes (never a signed-in Banner session), then
// pickRealSchedule over them. Banner throttles bursts by answering empty, so at most two requests
// run at once and an empty answer gets one second look. Each course's last good answer is kept on
// this device, so a dropped connection falls back to it, and with nothing kept to hash-based practice
// sections (src/lib/mockRegistration.ts). An 'offline' plan's CRNs are placeholders: never fill them
// into PAWS.

const CACHE_PREFIX = 'studymax:sections:'
const IN_FLIGHT = 2
const RETRY_MS = 1200
/** Candidates looked up for one elective slot before it's left open. */
const SLOT_TRIES = 6

type Source = RegPlan['source']
const WORST: Source[] = ['live', 'cached', 'offline']

interface CourseData {
  sections: Section[]
  source: Source
  fetchedAt: string | null
}

// ─────────────────────────────────────────────────────────────── plumbing

function abortError(): Error {
  return typeof DOMException === 'function' ? new DOMException('Aborted', 'AbortError') : Object.assign(new Error('Aborted'), { name: 'AbortError' })
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError())
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(abortError())
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/** At most `limit` of the calls it wraps run at once, in the order they were made. */
function limiter(limit: number) {
  let running = 0
  const queue: (() => void)[] = []
  return async <T>(fn: () => Promise<T>): Promise<T> => {
    if (running >= limit) await new Promise<void>((resolve) => queue.push(resolve))
    running++
    try {
      return await fn()
    } finally {
      running--
      queue.shift()?.()
    }
  }
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(api(path), { cache: 'no-store', signal })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return (await res.json()) as T
}

// ─────────────────────────────────────────────────────────────── the device cache

const cacheKey = (term: string, code: string) => `${CACHE_PREFIX}${term}:${code}`

function readCache(term: string, code: string): { sections: Section[]; fetchedAt: string } | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(cacheKey(term, code)) ?? 'null') as { sections?: unknown; fetchedAt?: unknown } | null
    if (!parsed || !Array.isArray(parsed.sections) || parsed.sections.length === 0 || typeof parsed.fetchedAt !== 'string') return null
    return { sections: parsed.sections as Section[], fetchedAt: parsed.fetchedAt }
  } catch {
    return null
  }
}

function writeCache(term: string, code: string, sections: Section[], fetchedAt: string) {
  try {
    localStorage.setItem(cacheKey(term, code), JSON.stringify({ fetchedAt, sections }))
  } catch {
    // storage blocked or full: this answer just isn't kept
  }
}

// ─────────────────────────────────────────────────────────────── offline sections

const DAY_NAMES: Record<string, string> = { Mon: 'monday', Tue: 'tuesday', Wed: 'wednesday', Thu: 'thursday', Fri: 'friday', Sat: 'saturday', Sun: 'sunday' }

/** The practice sections for a course, as Banner-shaped Sections: open, 12 seats, placeholder CRNs. */
export function offlineSections(code: string, title: string, termCode: string, termLabel: string): Section[] {
  const [, subject = code, number = ''] = code.match(/^([A-Z]+)(\d+[A-Z]?)$/) ?? []
  return sectionsFor(code, false).map((s) => ({
    seatsAvailable: 12,
    maximumEnrollment: 12,
    enrollment: 0,
    waitAvailable: 0,
    waitCapacity: 0,
    waitCount: 0,
    seatsAvailableUnreserved: null,
    hasReservedSeats: false,
    crn: s.crn,
    term: termCode,
    termDesc: termLabel,
    subject,
    courseNumber: number,
    sectionNumber: s.section,
    courseTitle: title,
    creditHours: s.type === 'Lecture' ? 3 : null,
    instructors: [],
    meetings: [
      {
        days: s.days.map((d) => DAY_NAMES[d] ?? d),
        beginTime: s.start.replace(':', ''),
        endTime: s.end.replace(':', ''),
        building: null,
        room: null,
      },
    ],
    scheduleType: s.type === 'Lab' ? 'Laboratory' : s.type,
    isSectionLinked: false,
    campus: 'USask - Main Saskatoon Campus',
    linkIdentifier: null,
    status: 'open',
  }))
}

// ─────────────────────────────────────────────────────────────── loading

/**
 * The request's real schedule. Looks up the term (open or view-only) and every booked and named
 * course's sections, then each elective slot's candidates in order, a couple at a time, until one
 * places (at most SLOT_TRIES per slot). Never rejects for a network failure: a course that can't be read
 * live uses its last kept answer ('cached'), else practice sections ('offline'), and the plan's
 * source is the worst of its courses. It does reject, with an AbortError, when `opts.signal` aborts.
 * `request` comes back as given.
 */
export async function loadRegistration(request: RegRequest, opts: { signal?: AbortSignal } = {}): Promise<RegPlan> {
  const { signal } = opts
  const run = limiter(IN_FLIGHT)
  const titles = new Map(
    [...request.booked, ...request.courses, ...request.slots.flatMap((s) => s.candidates)].map((c) => [c.code, c.title]),
  )

  const readCourse = async (code: string): Promise<CourseData> => {
    const search = () =>
      run(() => getJson<{ sections?: Section[] }>(`/api/classes?op=search&term=${request.termCode}&course=${encodeURIComponent(code)}`, signal))
    try {
      let answer = await search()
      if (!Array.isArray(answer.sections)) throw new Error('unexpected answer')
      if (answer.sections.length === 0) {
        // Banner throttles by answering empty, so "not running" gets a second look first.
        await wait(RETRY_MS, signal)
        answer = await search()
        if (!Array.isArray(answer.sections)) throw new Error('unexpected answer')
      }
      const fetchedAt = new Date().toISOString()
      if (answer.sections.length > 0) {
        writeCache(request.termCode, code, answer.sections, fetchedAt)
        return { sections: answer.sections, source: 'live', fetchedAt }
      }
      // Still empty: not running this term, or still throttled. A course seen before keeps that reading.
      const kept = readCache(request.termCode, code)
      return kept ? { ...kept, source: 'cached' } : { sections: [], source: 'live', fetchedAt }
    } catch {
      if (signal?.aborted) throw abortError()
      const kept = readCache(request.termCode, code)
      if (kept) return { ...kept, source: 'cached' }
      return {
        sections: offlineSections(code, titles.get(code) ?? code, request.termCode, request.termLabel),
        source: 'offline',
        fetchedAt: null,
      }
    }
  }

  const loads = new Map<string, Promise<CourseData>>()
  const load = (code: string) => {
    let pending = loads.get(code)
    if (!pending) loads.set(code, (pending = readCourse(code)))
    return pending
  }

  // Open when Banner lists the term without "(View Only)"; a term it doesn't list isn't open yet.
  // Never rejects, so an abort mid-load leaves no stray rejection behind.
  const termsLoad = run(() => getJson<{ terms?: Term[] }>('/api/classes?op=terms', signal)).then(
    ({ terms }) => {
      if (!Array.isArray(terms)) return null
      const term = terms.find((t) => t.code === request.termCode)
      return term ? !term.viewOnly : false
    },
    () => null,
  )

  const data: Record<string, CourseData> = {}
  const fixed = [...new Set([...request.booked, ...request.courses].map((c) => c.code))]
  await Promise.all(fixed.map(async (code) => (data[code] = await load(code))))

  // Each slot looks candidates up in order, two at a time, until one places; the final schedule is
  // then computed over exactly the candidates each slot tried, so it matches what was decided here.
  const sectionsOf = () => Object.fromEntries(Object.entries(data).map(([code, d]) => [code, d.sections]))
  const tried: ElectiveSlot[] = []
  // A course an earlier slot took or tried isn't worth a second try: what's held only grows.
  const seen = new Set<string>()
  for (const slot of request.slots) {
    const attempt: ElectiveSlot = { label: slot.label, candidates: [] }
    const queue = slot.candidates.filter((c) => !seen.has(c.code)).slice(0, SLOT_TRIES)
    for (let i = 0; i < queue.length; i += IN_FLIGHT) {
      const batch = queue.slice(i, i + IN_FLIGHT)
      await Promise.all(batch.map(async (c) => (data[c.code] = await load(c.code))))
      let placed = false
      for (const candidate of batch) {
        attempt.candidates.push(candidate)
        const detail = placeSchedule({ ...request, slots: [...tried, attempt] }, sectionsOf())
        if (detail.slotCodes.at(-1)) {
          placed = true
          break
        }
      }
      if (placed) break
    }
    attempt.candidates.forEach((c) => seen.add(c.code))
    tried.push(attempt)
  }

  const termOpen = await termsLoad
  if (signal?.aborted) throw abortError()
  const schedule = placeSchedule({ ...request, slots: tried }, sectionsOf())
  // The source and age of what the schedule was built from (a candidate fetched but never tried doesn't count).
  const used = [...fixed, ...tried.flatMap((s) => s.candidates.map((c) => c.code))].map((code) => data[code])
  const source = used.reduce<Source>((worst, d) => (WORST.indexOf(d.source) > WORST.indexOf(worst) ? d.source : worst), 'live')
  const times = used.map((d) => d.fetchedAt).filter((t): t is string => t !== null).sort()
  return {
    request,
    source,
    fetchedAt: times[0] ?? null,
    termOpen,
    picks: schedule.picks,
    booked: schedule.booked,
    unplaced: schedule.unplaced,
    crns: schedule.crns,
  }
}
