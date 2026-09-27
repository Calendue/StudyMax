// The class tracker: watch a full USask section and hear the moment a seat opens. Ported from
// CalenDue's class tracker. This file is pure (no network, no storage) so the server route can share
// its types and the "is this an opening?" decision stays in one place.

export interface Term {
  code: string
  description: string
  /** Banner marks terms closed for registration "(View Only)". */
  viewOnly: boolean
}

export interface MeetingPattern {
  days: string[]
  beginTime: string | null
  endTime: string | null
  building: string | null
  room: string | null
}

export interface SeatState {
  seatsAvailable: number
  maximumEnrollment: number
  enrollment: number
  waitAvailable: number
  waitCapacity: number
  waitCount: number
  /** Only when Banner publishes a reserved-seat split for the section. */
  seatsAvailableUnreserved: number | null
  hasReservedSeats: boolean
}

export type SectionStatus = 'open' | 'waitlist' | 'full' | 'unknown'

export interface Section extends SeatState {
  crn: string
  term: string
  termDesc: string
  subject: string
  courseNumber: string
  sectionNumber: string
  courseTitle: string
  creditHours: number | null
  instructors: string[]
  meetings: MeetingPattern[]
  scheduleType: string | null
  isSectionLinked: boolean
  status: SectionStatus
}

/** A section the student is watching, with the last reading StudyMax took of it. */
export interface Watch {
  crn: string
  term: string
  termDesc: string
  subject: string
  courseNumber: string
  sectionNumber: string
  courseTitle: string
  scheduleType: string | null
  when: string
  hasReservedSeats: boolean
  status: SectionStatus
  seats: number
  checkedAt: number
  /** Set when a closed section opened while watched; cleared when it closes again. */
  openedAt: number | null
}

/**
 * How many sections a student can watch. The seat check is capped at the same number of courses, so
 * no watch is ever silently left out of a check.
 */
export const MAX_WATCHES = 12

/** PAWS is where registering actually happens. StudyMax only watches and points there. */
export const PAWS_URL = 'https://paws.usask.ca'

/**
 * A status StudyMax is willing to show. `seatsAvailable` includes reserved seats the student may not
 * qualify for, so a section is only "open" when unreserved seats exist.
 */
export function deriveStatus(seats: SeatState): SectionStatus {
  const generallyOpen = seats.hasReservedSeats ? (seats.seatsAvailableUnreserved ?? 0) > 0 : seats.seatsAvailable > 0
  if (generallyOpen) return 'open'
  if (seats.waitAvailable > 0) return 'waitlist'
  if (seats.maximumEnrollment > 0 || seats.enrollment > 0 || seats.waitCapacity > 0) return 'full'
  return 'unknown'
}

/** Seats we'll advertise: reserved ones are left out when Banner tells us the split. */
export function openSeats(seats: SeatState): number {
  return seats.hasReservedSeats && seats.seatsAvailableUnreserved !== null ? seats.seatsAvailableUnreserved : seats.seatsAvailable
}

/**
 * Folds a fresh reading into a watch and says whether it's news. Rules carried over from CalenDue:
 * a section already open when watched is not an opening; an `unknown` reading is a Banner hiccup and
 * keeps the last good one; re-opening after a close alerts again, staying open doesn't. A watch that
 * only ever had an `unknown` reading was never seen open, so its first open reading is news too.
 */
export function applyReading(watch: Watch, live: SeatState, now: number): { next: Watch; opened: boolean } {
  const status = deriveStatus(live)
  if (status === 'unknown') return { next: { ...watch, checkedAt: now }, opened: false }
  const opened = status === 'open' && watch.status !== 'open'
  return {
    next: {
      ...watch,
      status,
      seats: status === 'waitlist' ? live.waitAvailable : openSeats(live),
      checkedAt: now,
      openedAt: opened ? now : status === 'open' ? watch.openedAt : null,
    },
    opened,
  }
}

export function watchFrom(section: Section, now: number): Watch {
  return {
    crn: section.crn,
    term: section.term,
    termDesc: section.termDesc,
    subject: section.subject,
    courseNumber: section.courseNumber,
    sectionNumber: section.sectionNumber,
    courseTitle: section.courseTitle,
    scheduleType: section.scheduleType,
    when: section.meetings.map(formatMeeting).join('; ') || 'Times TBA',
    hasReservedSeats: section.hasReservedSeats,
    status: section.status,
    seats: section.status === 'waitlist' ? section.waitAvailable : openSeats(section),
    checkedAt: now,
    openedAt: null,
  }
}

// ─────────────────────────────────────────────────────────────── words

const DAY_ABBR: Record<string, string> = {
  monday: 'Mon',
  tuesday: 'Tue',
  wednesday: 'Wed',
  thursday: 'Thu',
  friday: 'Fri',
  saturday: 'Sat',
  sunday: 'Sun',
}

/** "1430" -> "2:30 PM". */
export function formatBannerTime(value: string | null): string | null {
  if (!value || !/^\d{3,4}$/.test(value)) return null
  const padded = value.padStart(4, '0')
  const hour = Number(padded.slice(0, 2))
  const minute = Number(padded.slice(2))
  if (hour > 23 || minute > 59) return null
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(2000, 0, 1, hour, minute))
}

export function formatMeeting(meeting: MeetingPattern): string {
  const days = meeting.days.map((d) => DAY_ABBR[d] ?? d).join(' ')
  const start = formatBannerTime(meeting.beginTime)
  const end = formatBannerTime(meeting.endTime)
  const time = start && end ? `${start} – ${end}` : start ?? 'Time TBA'
  const place = [meeting.building, meeting.room].filter(Boolean).join(' ')
  return [days || 'Days TBA', time, place].filter(Boolean).join(' · ')
}

export function statusLabel(status: SectionStatus, seats: number): string {
  switch (status) {
    case 'open':
      return seats === 1 ? '1 seat open' : `${seats} seats open`
    case 'waitlist':
      return 'Waitlist open'
    case 'full':
      return 'Full'
    default:
      return 'No seat data'
  }
}

/** Plan terms read "Winter 2027"; Banner calls that 202701. */
export function bannerTermCode(label: string): string | null {
  const match = label.match(/(Fall|Winter|Spring|Summer)\s+(\d{4})/)
  if (!match) return null
  const month = { Winter: '01', Spring: '05', Summer: '07', Fall: '09' }[match[1] as 'Fall']
  return `${match[2]}${month}`
}

/**
 * The term a student is most likely registering for. Banner lists terms newest-first, so the first
 * one is a Summer over a year away; the earliest term not marked view-only is the live one.
 */
export function defaultTerm(terms: Term[]): Term | null {
  const open = terms.filter((t) => !t.viewOnly)
  if (open.length) return open.reduce((a, b) => (b.code < a.code ? b : a))
  return terms[0] ?? null
}
