// USask Banner Self-Service 9 (class search) client, ported from CalenDue's class tracker
// (calendue_demo/lib/classRegistration/bannerApi.ts). Endpoint behaviour was verified live there:
//
//  * Seat checks re-read the course's sections rather than CalenDue's cheaper `getEnrollmentInfo`,
//    because that endpoint drops the reserved-seat split, and most USask sections reserve seats.
//  * A Banner session replays its previous search, so every search opens a fresh session. Posting
//    `resetDataForm` instead unbinds the term and returns nothing.
//  * Banner throttles by answering `totalCount: 0` with a 200, not with an error.
//  * `seatsAvailable` counts reserved seats; a section is only "open" when unreserved seats exist.

import { deriveStatus, type MeetingPattern, type SeatState, type Section, type Term } from '../src/lib/classTracker.js'

const BANNER_BASE = 'https://banner.usask.ca/StudentRegistrationSsb/ssb'
const USER_AGENT = 'StudyMax/1.0 (+https://study-max-theta.vercel.app)'
const TIMEOUT_MS = 10_000

export class BannerError extends Error {
  status?: number
  constructor(message: string, status?: number) {
    super(message)
    this.name = 'BannerError'
    this.status = status
  }
}

async function bannerFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      // No keep-alive: over a reused connection Banner binds the term to a different session than the
      // search runs under, and every search after the first comes back empty (seen live).
      headers: { 'User-Agent': USER_AGENT, Connection: 'close', ...(init.headers as Record<string, string> | undefined) },
    })
  } catch (error) {
    if (controller.signal.aborted) throw new BannerError('Banner timed out')
    throw new BannerError(`Banner request failed: ${(error as Error).message}`)
  } finally {
    clearTimeout(timer)
  }
}

async function bannerJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await bannerFetch(url, init)
  if (!res.ok) throw new BannerError(`Banner returned ${res.status}`, res.status)
  try {
    return JSON.parse(await res.text()) as T
  } catch {
    throw new BannerError('Banner returned a non-JSON body', res.status)
  }
}

// ─────────────────────────────────────────────────────────────── normalize

const DAY_KEYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const

function toInt(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10)
  return Number.isFinite(parsed) ? parsed : 0
}

function normalizeSeatState(raw: Record<string, unknown>): SeatState {
  const reserved = raw.reservedSeatSummary as Record<string, unknown> | null | undefined
  const hasReservedSeats = !!reserved && toInt(reserved.maximumEnrollmentReserved) > 0
  return {
    seatsAvailable: toInt(raw.seatsAvailable),
    maximumEnrollment: toInt(raw.maximumEnrollment),
    enrollment: toInt(raw.enrollment),
    waitAvailable: toInt(raw.waitAvailable),
    waitCapacity: toInt(raw.waitCapacity),
    waitCount: toInt(raw.waitCount),
    seatsAvailableUnreserved: hasReservedSeats ? toInt(reserved!.seatsAvailableUnreserved) : null,
    hasReservedSeats,
  }
}

/** `creditHourLow` is often 0 next to a real `creditHours`, so the low bound is the last resort. */
function creditHours(raw: Record<string, unknown>): number | null {
  for (const key of ['creditHours', 'creditHourHigh', 'creditHourLow']) {
    const value = toInt(raw[key])
    if (value > 0) return value
  }
  return null
}

function meetings(raw: Record<string, unknown>): MeetingPattern[] {
  const entries = Array.isArray(raw.meetingsFaculty) ? raw.meetingsFaculty : []
  return entries.flatMap((entry) => {
    const m = (entry as Record<string, unknown>)?.meetingTime as Record<string, unknown> | undefined
    if (!m) return []
    return [
      {
        days: DAY_KEYS.filter((day) => m[day] === true),
        beginTime: (m.beginTime as string | null) ?? null,
        endTime: (m.endTime as string | null) ?? null,
        building: (m.buildingDescription as string | null) ?? (m.building as string | null) ?? null,
        room: (m.room as string | null) ?? null,
      },
    ]
  })
}

/** Instructors from the section and from every meeting entry. */
function instructors(raw: Record<string, unknown>): string[] {
  const names = new Set<string>()
  const collect = (list: unknown) => {
    if (!Array.isArray(list)) return
    for (const member of list) {
      const name = (member as Record<string, unknown>)?.displayName
      if (typeof name === 'string' && name.trim()) names.add(name.trim())
    }
  }
  collect(raw.faculty)
  for (const entry of Array.isArray(raw.meetingsFaculty) ? raw.meetingsFaculty : []) {
    collect((entry as Record<string, unknown>)?.faculty)
  }
  return [...names]
}

function normalizeSection(raw: Record<string, unknown>): Section {
  const seats = normalizeSeatState(raw)
  return {
    ...seats,
    crn: String(raw.courseReferenceNumber ?? ''),
    term: String(raw.term ?? ''),
    termDesc: String(raw.termDesc ?? '').replace(/\(view only\)/i, '').trim(),
    subject: String(raw.subject ?? ''),
    courseNumber: String(raw.courseNumber ?? ''),
    sectionNumber: String(raw.sequenceNumber ?? ''),
    courseTitle: String(raw.courseTitle ?? ''),
    creditHours: creditHours(raw),
    instructors: instructors(raw),
    meetings: meetings(raw),
    scheduleType: (raw.scheduleTypeDescription as string | null) ?? null,
    isSectionLinked: raw.isSectionLinked === true,
    status: deriveStatus(seats),
  }
}

// ─────────────────────────────────────────────────────────────── terms

const VIEW_ONLY = /\(view only\)/i

export async function getTerms(): Promise<Term[]> {
  const raw = await bannerJson<Array<{ code: string; description: string }>>(
    `${BANNER_BASE}/classSearch/getTerms?dataType=json&searchTerm=&offset=1&max=12`,
  )
  if (!Array.isArray(raw)) throw new BannerError('Banner getTerms returned an unexpected shape')
  return raw
    .filter((t) => /^\d{6}$/.test(t.code))
    .map((t) => ({ code: t.code, description: t.description.replace(VIEW_ONLY, '').trim(), viewOnly: VIEW_ONLY.test(t.description) }))
}

// ─────────────────────────────────────────────────────────────── search

class CookieJar {
  private cookies = new Map<string, string>()
  absorb(response: Response) {
    for (const raw of response.headers.getSetCookie?.() ?? []) {
      const pair = raw.split(';')[0]
      const at = pair.indexOf('=')
      if (at > 0) this.cookies.set(pair.slice(0, at), pair.slice(at + 1))
    }
  }
  has(name: string) {
    return this.cookies.has(name)
  }
  header() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ')
  }
}

/**
 * Opens a session and binds the term to it. Over a reused keep-alive connection Banner can answer
 * the first request with only the load-balancer cookie, so the class-search entry point is tried
 * too before giving up on a JSESSIONID.
 */
async function openSession(term: string): Promise<string> {
  const jar = new CookieJar()
  jar.absorb(await bannerFetch(`${BANNER_BASE}/term/termSelection?mode=search`))
  if (!jar.has('JSESSIONID')) {
    jar.absorb(await bannerFetch(`${BANNER_BASE}/classSearch/classSearch`, { headers: { Cookie: jar.header() } }))
  }
  if (!jar.has('JSESSIONID')) throw new BannerError('Banner did not issue a session')
  const bind = await bannerFetch(`${BANNER_BASE}/term/search?mode=search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: jar.header() },
    body: new URLSearchParams({ term, studyPath: '', studyPathText: '', startDatepicker: '', endDatepicker: '' }).toString(),
  })
  if (!bind.ok) throw new BannerError(`Banner term binding failed: ${bind.status}`, bind.status)
  jar.absorb(bind)
  return jar.header()
}

/** Every section of one course in one term (a course rarely has more than a few dozen). */
export async function searchCourse(term: string, subject: string, courseNumber: string): Promise<Section[]> {
  const cookie = await openSession(term)
  const qs = new URLSearchParams({
    txt_subject: subject,
    txt_courseNumber: courseNumber,
    txt_term: term,
    startDatepicker: '',
    endDatepicker: '',
    pageOffset: '0',
    pageMaxSize: '100',
    sortColumn: 'subjectDescription',
    sortDirection: 'asc',
  })
  const json = await bannerJson<{ data: Array<Record<string, unknown>> | null }>(`${BANNER_BASE}/searchResults/searchResults?${qs}`, {
    headers: { Cookie: cookie },
  })
  return (json.data ?? []).map(normalizeSection)
}
