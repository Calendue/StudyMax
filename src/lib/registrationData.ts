import { api } from '../platform.ts'
import type { Section, Term } from './classTracker.ts'
import { sectionsFor } from './mockRegistration.ts'
import { placeSchedule, type ElectiveSlot, type RegPlan, type RegRequest } from './registration.ts'

// Real class registration, the network part: the sections of every course a RegRequest names, from
// USask's public class search through /api/classes (never a signed-in Banner session), then
// pickRealSchedule over them. Banner throttles bursts by answering empty, so at most two requests
// run at once and an empty answer gets one second look. Each request gives up after TIMEOUT_MS. Each
// course's last good answer is kept on this device, so a dropped (or stalled) connection falls back to
// it, and with nothing kept to hash-based practice sections (src/lib/mockRegistration.ts). An
// 'offline' plan's CRNs are placeholders, and so are a preview's (a term Banner hasn't published yet,
// planned on the same season a year earlier): never fill them into PAWS.

const CACHE_PREFIX = 'studymax:sections:'
const IN_FLIGHT = 2
const RETRY_MS = 1200
/** One request's limit: a stalled one counts as a network failure. */
const TIMEOUT_MS = 12_000
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

/**
 * One GET with its own time limit. Its controller also follows the caller's signal (by hand: WKWebView
 * before iOS 17.4 has no AbortSignal.any). It rejects with an AbortError only when the caller aborted;
 * a timeout is a plain failure, like a dropped connection.
 */
async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  if (signal?.aborted) throw abortError()
  const controller = new AbortController()
  const forward = () => controller.abort()
  signal?.addEventListener('abort', forward, { once: true })
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(api(path), { cache: 'no-store', signal: controller.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return (await res.json()) as T
  } catch (err) {
    if (signal?.aborted) throw abortError()
    throw controller.signal.aborted ? new Error(`No answer in ${TIMEOUT_MS / 1000} seconds`) : err
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', forward)
  }
}

const SEASON_OF_MONTH: Record<string, string> = { '01': 'Winter', '05': 'Spring', '07': 'Summer', '09': 'Fall' }

/** '202609' -> 'Fall 2026' (bannerTermCode backwards). */
function termLabelOf(code: string): string {
  return `${SEASON_OF_MONTH[code.slice(4)] ?? 'Term'} ${code.slice(0, 4)}`
}

/**
 * Which term's sections to read. Banner's own term when it lists it (open, or view-only); when it
 * doesn't list it yet, the latest listed term of the same season (202609 for 202709), as a preview.
 * Unreadable terms (an empty list is Banner throttling) leave the request's term, with termOpen
 * unknown; so does a term Banner doesn't list with no same-season term to stand in (it lists about
 * three years, so in practice there always is one).
 */
function termToRead(request: RegRequest, terms: Term[] | null): { termCode: string; termOpen: boolean | null; preview?: RegPlan['preview'] } {
  if (!terms) return { termCode: request.termCode, termOpen: null }
  const listed = terms.find((t) => t.code === request.termCode)
  if (listed) return { termCode: request.termCode, termOpen: !listed.viewOnly }
  const season = request.termCode.slice(4)
  const stand = terms
    .map((t) => t.code)
    .filter((code) => code.slice(4) === season && code < request.termCode)
    .sort()
    .at(-1)
  if (!stand) return { termCode: request.termCode, termOpen: null }
  return { termCode: stand, termOpen: false, preview: { termCode: stand, termLabel: termLabelOf(stand) } }
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
 * The request's real schedule. Looks up the term first (open, view-only, or not published yet, when
 * the same season's latest listed term stands in: `preview`), then every booked and named course's
 * sections, then each elective slot's candidates in order, a couple at a time, until one places (at
 * most SLOT_TRIES per slot). Never rejects for a network failure: a course that can't be read live
 * uses its last kept answer ('cached'), else practice sections ('offline'), and the plan's source is
 * the worst of its courses. It does reject, with an AbortError, when `opts.signal` aborts. `request`
 * comes back as given.
 */
export async function loadRegistration(request: RegRequest, opts: { signal?: AbortSignal } = {}): Promise<RegPlan> {
  const { signal } = opts
  const run = limiter(IN_FLIGHT)
  const titles = new Map(
    [...request.booked, ...request.courses, ...request.slots.flatMap((s) => s.candidates)].map((c) => [c.code, c.title]),
  )

  // The term decides which timetable is read, so it comes first. Unreadable, it's the request's own.
  const terms = await run(() => getJson<{ terms?: Term[] }>('/api/classes?op=terms', signal)).then(
    ({ terms }) => (Array.isArray(terms) && terms.length > 0 ? terms : null),
    () => null,
  )
  if (signal?.aborted) throw abortError()
  const { termCode, termOpen, preview } = termToRead(request, terms)
  const termLabel = preview?.termLabel ?? request.termLabel

  const readCourse = async (code: string): Promise<CourseData> => {
    const search = () =>
      run(() => getJson<{ sections?: Section[] }>(`/api/classes?op=search&term=${termCode}&course=${encodeURIComponent(code)}`, signal))
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
        writeCache(termCode, code, answer.sections, fetchedAt)
        return { sections: answer.sections, source: 'live', fetchedAt }
      }
      // Still empty: not running this term, or still throttled. A course seen before keeps that reading.
      const kept = readCache(termCode, code)
      return kept ? { ...kept, source: 'cached' } : { sections: [], source: 'live', fetchedAt }
    } catch {
      if (signal?.aborted) throw abortError()
      const kept = readCache(termCode, code)
      if (kept) return { ...kept, source: 'cached' }
      return {
        sections: offlineSections(code, titles.get(code) ?? code, termCode, termLabel),
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

  const data: Record<string, CourseData> = {}
  const fixed = [...new Set([...request.booked, ...request.courses].map((c) => c.code))]
  await Promise.all(fixed.map(async (code) => (data[code] = await load(code))))

  // Each slot looks candidates up in order, two at a time, until one places; the final schedule is
  // then computed over exactly the candidates each slot tried, so it matches what was decided here.
  const sectionsOf = () => Object.fromEntries(Object.entries(data).map(([code, d]) => [code, d.sections]))
  const where = preview ? { timetable: preview.termLabel } : {}
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
        const detail = placeSchedule({ ...request, slots: [...tried, attempt] }, sectionsOf(), where)
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

  if (signal?.aborted) throw abortError()
  const schedule = placeSchedule({ ...request, slots: tried }, sectionsOf(), where)
  // The source and age of what the schedule was built from (a candidate fetched but never tried doesn't count).
  const used = [...fixed, ...tried.flatMap((s) => s.candidates.map((c) => c.code))].map((code) => data[code])
  const source = used.reduce<Source>((worst, d) => (WORST.indexOf(d.source) > WORST.indexOf(worst) ? d.source : worst), 'live')
  const times = used.map((d) => d.fetchedAt).filter((t): t is string => t !== null).sort()
  return {
    request,
    source,
    fetchedAt: times[0] ?? null,
    termOpen,
    ...(preview ? { preview } : {}),
    picks: schedule.picks,
    booked: schedule.booked,
    unplaced: schedule.unplaced,
    crns: schedule.crns,
  }
}
