// The practice run: a simulated registration page that plays out Max's real picks (a RegPlan from
// registrationData.ts) as a script, and the hash-based practice sections the offline fallback uses.
// Pure apart from the saved practice run in localStorage. No network, no real USask call.
import type { SectionStatus } from './classTracker.ts'
import type { RegMeeting, RegPick, RegPlan } from './registration.ts'

export type SectionType = 'Lecture' | 'Lab' | 'Tutorial'

/** One section on the simulated page: one of Max's picks, or a booked course's section (context). */
export interface RegRow {
  crn: string
  code: string
  title: string
  section: string
  /** Banner's schedule type: 'Lecture', 'Laboratory', 'Tutorial', ... */
  type: string
  /** The lecture, which carries the credit units; a linked lab or tutorial has 0. */
  main: boolean
  credits: number
  /** Every meeting of the section (a lecture can meet MW at one time and F at another). */
  meetings: RegMeeting[]
  seats: number
  seatStatus: SectionStatus
  /** Set when Max picked this course for an elective slot ("Indigenous learning"). */
  slotLabel?: string
  /** 'error' is a full section the practice run's submit would have been refused. */
  status: 'pending' | 'registered' | 'error'
}

export interface RegState {
  termLabel: string
  rows: RegRow[]
  submittedAt: string | null
}

export interface FakeSection {
  section: string
  type: SectionType
  crn: string
  days: string[]
  start: string
  end: string
}

function hashCode(code: string): number {
  let h = 0
  for (let i = 0; i < code.length; i++) h = (h * 31 + code.charCodeAt(i)) >>> 0
  return h
}

const MWF = ['Mon', 'Wed', 'Fri']
const TR = ['Tue', 'Thu']

function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function crnFrom(seed: number): string {
  return String(10000 + (seed % 90000)).slice(0, 5)
}

/** Deterministic practice sections for a course, derived from a hash of its code (the offline fallback). */
export function sectionsFor(code: string, hasLab: boolean): FakeSection[] {
  const h = hashCode(code)
  // 8:30 to 16:00 window. MWF: 50 min slots. TR: 80 min slots.
  const mwfStart = 510 + (h % 8) * 55 // 8:30 + up to 7 slots of 55 min
  const trStart = 510 + ((h >> 3) % 6) * 90

  const lecture1: FakeSection = {
    section: '01',
    type: 'Lecture',
    crn: crnFrom(h),
    days: MWF,
    start: minutesToTime(mwfStart),
    end: minutesToTime(mwfStart + 50),
  }
  const lecture2: FakeSection = {
    section: '02',
    type: 'Lecture',
    crn: crnFrom(h + 1),
    days: TR,
    start: minutesToTime(trStart),
    end: minutesToTime(trStart + 80),
  }
  const sections: FakeSection[] = [lecture1, lecture2]

  if (hasLab) {
    const labStart = 510 + ((h >> 5) % 7) * 55
    const labDay = (h >> 7) % 5
    sections.push({
      section: 'L01',
      type: 'Lab',
      crn: crnFrom(h + 2),
      days: [['Mon', 'Tue', 'Wed', 'Thu', 'Fri'][labDay]],
      start: minutesToTime(labStart),
      end: minutesToTime(labStart + 110),
    })
  }
  return sections
}

/** The practice sections for a course, with the lab a third of courses get. */
export function optionsFor(code: string) {
  return sectionsFor(code, hashCode(code) % 3 === 0)
}

/**
 * One beat of the agent's script. `type-subject`/`type-number`/`search` point at `courseIndex` (into
 * the returned `courses`, whose search results the panel should be showing); `add` points at
 * `rowIndex` (into the returned `rows`, the section it just added). `note` only narrates.
 */
export type StepAction = 'type-subject' | 'type-number' | 'search' | 'add' | 'note' | 'submit'

export interface RegStep {
  action: StepAction
  text: string
  courseIndex?: number
  rowIndex?: number
  subject?: string
  number?: string
}

/** A course the practice run searches for, in the order the picks name it. */
export interface PracticeCourse {
  code: string
  title: string
  subject: string
  number: string
  slotLabel?: string
}

export interface PickResult {
  courses: PracticeCourse[]
  /** Max's picks, in order: exactly the sections the run adds. */
  rows: RegRow[]
  /** Courses already registered this term, drawn on the week as context. Never added. */
  booked: RegRow[]
  steps: RegStep[]
}

/** "CMPT370" -> { subject: "CMPT", number: "370" }. */
function splitCode(code: string): { subject: string; number: string } {
  const m = code.match(/^([A-Z]+)(\d+)$/)
  return m ? { subject: m[1], number: m[2] } : { subject: code, number: '' }
}

/** "CMPT370" -> "CMPT 370". Local, so the check script runs on plain Node. */
function spaced(code: string): string {
  return code.replace(/^([A-Z]+)(\d+)/, '$1 $2')
}

/** Banner's "Laboratory" reads as "Lab" beside a section number. */
export function typeWord(type: string): string {
  return type === 'Laboratory' ? 'Lab' : type
}

function rowFrom(pick: RegPick, status: RegRow['status']): RegRow {
  return {
    crn: pick.crn,
    code: pick.code,
    title: pick.title,
    section: pick.section,
    type: pick.type,
    main: pick.main,
    credits: pick.main ? pick.credits : 0,
    meetings: pick.meetings,
    seats: pick.seats,
    seatStatus: pick.status,
    ...(pick.slotLabel ? { slotLabel: pick.slotLabel } : {}),
    status,
  }
}

/**
 * The practice run's script from Max's real picks: for each course, type its subject and number,
 * search, say which elective slot it fills (when it fills one), and add its sections in the plan's
 * order (the lecture, then its linked lab or tutorial). Courses Max couldn't place are narrated, then
 * one submit closes it. Deterministic: the same plan gives the same script.
 */
export function scriptFromPlan(plan: Pick<RegPlan, 'picks' | 'booked' | 'unplaced'>): PickResult {
  const rows = plan.picks.map((p) => rowFrom(p, 'pending'))
  const booked = plan.booked.map((p) => rowFrom(p, 'registered'))
  const courses: PracticeCourse[] = []
  const steps: RegStep[] = []

  rows.forEach((row, rowIndex) => {
    let courseIndex = courses.findIndex((c) => c.code === row.code)
    if (courseIndex < 0) {
      courseIndex = courses.length
      const { subject, number } = splitCode(row.code)
      courses.push({ code: row.code, title: row.title, subject, number, slotLabel: row.slotLabel })
      steps.push({ action: 'type-subject', courseIndex, subject, text: `Typing ${subject}` })
      steps.push({ action: 'type-number', courseIndex, number, text: `Typing ${number}` })
      steps.push({ action: 'search', courseIndex, text: `Searching ${spaced(row.code)}` })
      // "Junior science: Biology, Chemistry or Earth Science" narrows the slot; the pick already says which.
      if (row.slotLabel) steps.push({ action: 'search', courseIndex, text: `${row.slotLabel.split(': ')[0]}: ${spaced(row.code)} fits` })
    }
    const what = `${spaced(row.code)} (${typeWord(row.type)} ${row.section})`
    steps.push({
      action: 'add',
      courseIndex,
      rowIndex,
      text: row.seatStatus === 'full' ? `Adding ${what}. It's full, so PAWS would say so` : `Adding ${what}`,
    })
  })

  for (const u of plan.unplaced) steps.push({ action: 'note', text: u.text })
  steps.push({ action: 'submit', text: 'Submitting' })

  return { courses, rows, booked, steps }
}

// ─────────────────────────────────────────────────────────────── the saved practice run

/**
 * A practice run is saved per student, term and exact list of CRNs, so another student on the same
 * device, another term or a changed list never opens someone else's finished run.
 */
export interface RegScope {
  /** The signed-in student's uid; null for a guest. */
  uid: string | null
  termLabel: string
  crns: string[]
}

export const STORAGE_PREFIX = 'studymax:mock-registration'

function scopePrefix(uid: string | null, termLabel: string): string {
  return `${STORAGE_PREFIX}:${uid ?? 'guest'}:${termLabel}:`
}

/** 'studymax:mock-registration:<uid or guest>:<termLabel>:<crns joined by commas>'. */
export function storageKey(scope: RegScope): string {
  return `${scopePrefix(scope.uid, scope.termLabel)}${scope.crns.join(',')}`
}

export function load(scope: RegScope): RegState | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey(scope)) ?? 'null') as RegState | null
    // Rows from before sections carried their meetings aren't drawable: treat them as no run.
    const ok = parsed && parsed.termLabel === scope.termLabel && parsed.rows.every((r) => Array.isArray(r.meetings))
    return ok ? parsed : null
  } catch {
    return null
  }
}

export function save(scope: RegScope, state: RegState) {
  try {
    localStorage.setItem(storageKey(scope), JSON.stringify(state))
  } catch {
    // storage blocked: the practice run still works for this session
  }
}

export function clear(scope: RegScope) {
  try {
    localStorage.removeItem(storageKey(scope))
  } catch {
    // ignore
  }
}

/** Whether this student finished a practice run for this term, whatever its CRNs (the Plan's button). */
export function hasSavedRun(uid: string | null, termLabel: string): boolean {
  try {
    const prefix = scopePrefix(uid, termLabel)
    for (let i = 0; i < localStorage.length; i++) if (localStorage.key(i)?.startsWith(prefix)) return true
    return false
  } catch {
    return false
  }
}
