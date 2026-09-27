import { openSeats, bannerTermCode, type Section, type SectionStatus } from './classTracker.ts'
import { electiveLabel, isElective, type PlannedTerm, type Season } from './plan.ts'
import { FREE_ELECTIVE, SENIOR_ELECTIVE } from './planDegree.ts'
import { courseCu, groupAccepts, TYPED_BREADTH_LABEL } from './degree.ts'
import { catalogueTitle } from './courseSearch.ts'
import { catalogueCourses } from '../data/courses.ts'
import { courseInfo } from '../data/prereqs.ts'
import { creditPrereqs } from '../data/creditPrereqs.ts'
import { offerings } from '../data/offerings.ts'
import { breadth } from '../data/breadth.ts'
import type { Degree, DegreeGroup } from '../data/degrees/types.ts'

// Real class registration, the pure part: what the next planned term asks the student to register
// for (its named courses, and a real course for each elective slot the degree gives a list for),
// and one clash-free set of USask sections for it from Banner's public class search. No React, no
// network, no storage: src/lib/registrationData.ts fetches the sections. Max only ever fills these
// CRNs into the student's own PAWS session; the student presses Submit.

export interface RegMeeting {
  /** 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun' */
  days: string[]
  /** 'HH:MM', 24-hour. */
  start: string
  end: string
}

export interface RegCourse {
  /** 'CMPT370' */
  code: string
  title: string
  /** Set when Max is picking it for an elective slot. */
  slotLabel?: string
}

export interface ElectiveSlot {
  /** 'Indigenous learning' */
  label: string
  /** Best first, each with slotLabel = label. */
  candidates: RegCourse[]
}

export interface RegRequest {
  /** 'Winter 2027' (the plan's first term) */
  termLabel: string
  /** '202701' */
  termCode: string
  /** The term's named (non-elective) courses. */
  courses: RegCourse[]
  /** The term's elective slots that map to a requirement list with candidates. */
  slots: ElectiveSlot[]
  /** Already registered this term: never re-registered, and their times are avoided. */
  booked: RegCourse[]
}

export interface RegPick {
  code: string
  title: string
  crn: string
  /** '02', 'L04', 'T02' */
  section: string
  /** Banner's schedule type: 'Lecture' | 'Laboratory' | 'Tutorial' | ... */
  type: string
  /** The lecture, which carries the credit units; a linked lab or tutorial is false. */
  main: boolean
  /** The lecture's credit units (3 when Banner doesn't say); 0 on linked sections. */
  credits: number
  /** May be several; empty for an asynchronous online section. */
  meetings: RegMeeting[]
  /** openSeats(): reserved seats left out when Banner publishes the split. */
  seats: number
  status: SectionStatus
  /** "Indigenous learning" when Max picked this course for an elective slot. */
  slotLabel?: string
}

export type UnplacedReason = 'full' | 'clash' | 'not-offered'

export interface Unplaced {
  code: string
  title: string
  reason: UnplacedReason
  /** A plain sentence for the student. */
  text: string
  slotLabel?: string
}

export interface RegPlan {
  request: RegRequest
  source: 'live' | 'cached' | 'offline'
  /** ISO time of the section data (the oldest reading used); null when none was real. */
  fetchedAt: string | null
  /** Banner lists the term as open for registration (not view-only); null when unknown. */
  termOpen: boolean | null
  /**
   * Set when Banner hasn't published the request's term yet: the sections are the latest listed term
   * of the same season (Fall 2026's for Fall 2027), a preview whose sections, times and CRNs will
   * change, so never filled into PAWS. termOpen is false then.
   */
  preview?: { termCode: string; termLabel: string }
  /** Each course's lecture followed by its linked sections, in course order. */
  picks: RegPick[]
  /** The booked courses' assumed sections, for the schedule view (context only). */
  booked: RegPick[]
  unplaced: Unplaced[]
  /** The picks' CRNs in order: exactly what gets typed into Enter CRNs. */
  crns: string[]
}

/** The plan's term type, under the name the registration contract uses. */
export type PlanTerm = PlannedTerm

/** Candidates offered for one elective slot. */
export const MAX_SLOT_CANDIDATES = 8

// ─────────────────────────────────────────────────────────────── the request

/** "CMPT370" -> "CMPT 370", for sentences. */
export const spacedCode = (code: string) => code.replace(/^([A-Z]+)(\d)/, '$1 $2')
const levelOf = (code: string) => Number(code.match(/(\d)\d\d[A-Z]?$/)?.[1] ?? 9)
const subjectOf = (code: string) => code.match(/^[A-Z]+/)?.[0] ?? ''
const unique = <T>(items: T[]) => [...new Set(items)]

function titleOf(code: string): string {
  return catalogueTitle(code) ?? courseInfo[code]?.title ?? spacedCode(code)
}

function seasonOf(termLabel: string): Season | null {
  if (/^Fall/.test(termLabel)) return 'Fall'
  if (/^Winter/.test(termLabel)) return 'Winter'
  if (/^(Spring|Summer)/.test(termLabel)) return 'Spring/Summer'
  return null
}

const CATALOGUE_SEASONS: Record<string, Season[]> = {
  fall: ['Fall'],
  winter: ['Winter'],
  either: ['Fall', 'Winter'],
  'spring-summer': ['Spring/Summer'],
  // A two-term course and one the catalogue doesn't schedule can't be registered for one term.
  'full-year': [],
  none: [],
}

/** 2 when Banner ran it in this season (2025-27), 1 when nobody says, 0 when it doesn't run then. */
function runsIn(code: string, season: Season | null): 0 | 1 | 2 {
  const banner = offerings[code]
  if (banner && banner.length > 0) return season === null || banner.includes(season) ? 2 : 0
  const offered = courseInfo[code]?.offered
  if (offered === undefined) return 1
  const seasons = CATALOGUE_SEASONS[offered] ?? []
  return season !== null && seasons.includes(season) ? 1 : 0
}

/**
 * Whether a student may register for `code`: every earlier-term prerequisite group met and the
 * credit-count rules met the way the planner counts them, from `prior` (completed and in progress:
 * a course booked for the same term isn't passed yet), and no antirequisite in `all` (prior and
 * booked). Same-term corequisites aren't checked (Banner allows them together).
 */
function eligible(code: string, prior: Set<string>, all: Set<string>, honours: boolean): boolean {
  const info = courseInfo[code]
  if (info?.antirequisites?.some((a) => all.has(a))) return false
  if (info?.requires.some((options) => options.length > 0 && !options.some((o) => prior.has(o)))) return false
  return [...(creditPrereqs[code] ?? []), ...(info?.creditRequires ?? [])].every((rule) => {
    if (rule.standing === 'honours') return honours
    let cu = 0
    for (const c of prior) {
      if (rule.subjects && !rule.subjects.includes(subjectOf(c))) continue
      if (rule.level && levelOf(c) * 100 !== rule.level) continue
      cu += courseCu(c)
    }
    return cu >= rule.cu
  })
}

/** The areas still open in a narrowed label ("Junior science: Biology, Chemistry or Earth Science"). */
function openAreaCourses(group: DegreeGroup, label: string): Set<string> | null {
  if (!group.areas || !label.startsWith(`${group.label}: `)) return null
  const names = label
    .slice(group.label.length + 2)
    .split(/,\s*|\s+or\s+/)
    .map((s) => s.trim())
    .filter((s) => s in group.areas!.byArea)
  return names.length > 0 ? new Set(names.flatMap((a) => group.areas!.byArea[a])) : null
}

/**
 * Real courses for one elective slot, best first: the group's preferred picks, then what Banner ran
 * this season before what nobody vouches for, then lower level (an elective slot is filled with an
 * entry course), then courses that run in more seasons (the big intro courses, with the most
 * sections), then the page's list order.
 */
function slotCandidates(
  slotCode: string,
  degree: Degree,
  season: Season | null,
  prior: Set<string>,
  taken: Set<string>,
  exclude: Set<string>,
): RegCourse[] {
  const label = electiveLabel(slotCode)
  if (label === FREE_ELECTIVE || label === SENIOR_ELECTIVE) return []
  const groups = degree.groups.filter((g) => groupAccepts(g, slotCode))
  const group = groups.find((g) => g.open) ?? groups[0]
  if (!group) return []

  const listed = new Set(group.courses)
  let pool = [...group.courses]
  // What the page gives by rule ("INDG 200-level or higher", "CMPT 410 or higher").
  if (group.matches) pool.push(...catalogueCourses.map((c) => c.code).filter((c) => !listed.has(c) && group.matches!(c)))
  const areas = openAreaCourses(group, label)
  if (areas) pool = pool.filter((c) => areas.has(c))
  if (label === TYPED_BREADTH_LABEL && group.typeMin) {
    const types = group.typeMin.types
    pool = pool.filter((c) => (breadth[c] ?? []).some((t) => types.includes(t)))
  }
  // "PHYS 117 or PHYS 125": with one taken, the other isn't a second pick.
  const takenAlternative = (code: string) => (group.oneOf ?? []).some((set) => set.includes(code) && set.some((c) => c !== code && taken.has(c)))
  const honours = degree.variant === 'bsc-honours'
  const position = new Map(pool.map((c, i) => [c, i]))
  const prefer = new Map((group.prefer ?? []).map((c, i) => [c, i]))
  const seasons = (code: string) => offerings[code]?.length ?? 0

  return unique(pool)
    .filter((c) => !taken.has(c) && !exclude.has(c) && !takenAlternative(c) && runsIn(c, season) > 0 && eligible(c, prior, taken, honours))
    .sort(
      (a, b) =>
        (prefer.get(a) ?? 99) - (prefer.get(b) ?? 99) ||
        runsIn(b, season) - runsIn(a, season) ||
        levelOf(a) - levelOf(b) ||
        seasons(b) - seasons(a) ||
        position.get(a)! - position.get(b)! ||
        (a < b ? -1 : a > b ? 1 : 0),
    )
    .slice(0, MAX_SLOT_CANDIDATES)
    .map((code) => ({ code, title: titleOf(code), slotLabel: label }))
}

/**
 * What registering for the plan's next term means, from model data: `plan` is the model's `plan`
 * (buildStudentPlan's output, whose first term is the next one), `booked` the model's `booked`
 * (courses already registered, by term label), `degree` the model's `activeDegree`, and `taken`
 * every course completed or in progress. Null when that term has nothing to register.
 */
export function registrationRequest(input: {
  plan: PlanTerm[]
  booked: Record<string, string[]>
  degree: Degree | null | undefined
  taken: Iterable<string>
}): RegRequest | null {
  const term = input.plan[0]
  if (!term) return null
  // Banner splits Spring/Summer into Spring (05) and Summer (07) terms: which one isn't Max's guess.
  if (seasonOf(term.label) === 'Spring/Summer') return null
  const termCode = bannerTermCode(term.label)
  if (!termCode) return null

  const bookedCodes = unique([
    ...(input.booked[term.label] ?? []),
    ...term.courses.filter((c) => c.reason === 'registered').map((c) => c.code),
  ]).filter((c) => !isElective(c))
  // Prerequisites count what's passed by then; "already have it" and antirequisites count the booked too.
  const prior = new Set(input.taken)
  const taken = new Set([...prior, ...bookedCodes])

  const courses = unique(term.courses.filter((c) => !isElective(c.code) && c.reason !== 'registered').map((c) => c.code))
    .filter((c) => !taken.has(c))
    .map((code) => ({ code, title: titleOf(code) }))

  // A slot never picks a course the plan already names, in this term or a later one.
  const named = new Set(input.plan.flatMap((t) => t.courses.map((c) => c.code)).filter((c) => !isElective(c)))
  const season = seasonOf(term.label)
  const slots: ElectiveSlot[] = []
  if (input.degree) {
    for (const course of term.courses) {
      if (!isElective(course.code)) continue
      const candidates = slotCandidates(course.code, input.degree, season, prior, taken, named)
      if (candidates.length > 0) slots.push({ label: electiveLabel(course.code), candidates })
    }
  }

  if (courses.length === 0 && slots.length === 0) return null
  return {
    termLabel: term.label,
    termCode,
    courses,
    slots,
    booked: bookedCodes.map((code) => ({ code, title: titleOf(code) })),
  }
}

/** "Max's pick for your Indigenous learning slot", "Max's pick for your junior science slot". */
export function slotPickLabel(slotLabel: string): string {
  // "Junior science: Biology, Chemistry or Earth Science" narrows the slot; the pick already says which.
  const base = slotLabel === TYPED_BREADTH_LABEL ? 'Humanities or Social Science breadth' : slotLabel.split(': ')[0]
  const first = base.split(/\s+/)[0] ?? ''
  const proper = /^(Indigenous|English|French|Canadian|Humanities)$/.test(first) || /[A-Z].*[A-Z]/.test(first)
  const words = proper ? base : base.charAt(0).toLowerCase() + base.slice(1)
  return `Max's pick for your ${words} slot`
}

// ─────────────────────────────────────────────────────────────── sections

const DAY_ABBR: Record<string, string> = {
  monday: 'Mon',
  tuesday: 'Tue',
  wednesday: 'Wed',
  thursday: 'Thu',
  friday: 'Fri',
  saturday: 'Sat',
  sunday: 'Sun',
}
const WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/** "0830" -> "08:30"; null for no time. */
function clock(value: string | null): string | null {
  if (!value || !/^\d{3,4}$/.test(value)) return null
  const padded = value.padStart(4, '0')
  return `${padded.slice(0, 2)}:${padded.slice(2)}`
}

/**
 * A section's weekly meetings, with no-time ones dropped and meetings at the same time merged
 * (CMPT 340's Mon/Wed and Fri entries at 10:30 are one MWF meeting).
 */
export function sectionMeetings(section: Section): RegMeeting[] {
  const byTime = new Map<string, RegMeeting>()
  for (const m of section.meetings) {
    const start = clock(m.beginTime)
    const end = clock(m.endTime)
    const days = m.days.map((d) => DAY_ABBR[d] ?? d).filter((d) => WEEK.includes(d))
    if (!start || !end || days.length === 0) continue
    const key = `${start}-${end}`
    const at = byTime.get(key)
    byTime.set(key, { days: unique([...(at?.days ?? []), ...days]).sort((a, b) => WEEK.indexOf(a) - WEEK.indexOf(b)), start, end })
  }
  const order = (m: RegMeeting) => `${WEEK.indexOf(m.days[0])}${m.start}${m.end}`
  return [...byTime.values()].sort((a, b) => (order(a) < order(b) ? -1 : order(a) > order(b) ? 1 : 0))
}

const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))

/** Two meeting lists share a day and overlap in time. */
export function meetingsClash(a: RegMeeting[], b: RegMeeting[]): boolean {
  return a.some((x) =>
    b.some((y) => x.days.some((d) => y.days.includes(d)) && minutes(x.start) < minutes(y.end) && minutes(y.start) < minutes(x.end)),
  )
}

/**
 * Saskatoon's main campus. An older deployment of the API doesn't send the campus; then web (W)
 * and regional (C) section numbers and fully online sections are the ones left out.
 */
export function onMainCampus(section: Section): boolean {
  if (section.campus) return /main saskatoon/i.test(section.campus)
  return !/^[WC]/i.test(section.sectionNumber) && !/online/i.test(section.scheduleType ?? '')
}

const SECONDARY_TYPE = /^(lab|tutorial|practicum|discussion)/i

/** The lecture of a link group ("M1"), or a stand-alone section that isn't a lab or tutorial. */
function isMain(section: Section): boolean {
  if (section.linkIdentifier) return /^M/i.test(section.linkIdentifier)
  return !SECONDARY_TYPE.test(section.scheduleType ?? '')
}

const isOpen = (section: Section) => section.status === 'open' && openSeats(section) > 0
const bySection = (a: Section, b: Section) => (a.sectionNumber < b.sectionNumber ? -1 : a.sectionNumber > b.sectionNumber ? 1 : 0)
/** "M1" -> "1", "L12" -> "12". */
const linkGroup = (id: string) => id.replace(/^[A-Za-z]+/, '')

/**
 * The sections a lecture needs alongside it, one list per kind, from all of the course's sections
 * (wherever they run): with Banner's link identifiers, the non-lecture sections of the same group
 * ("M2" takes one "L2" lab and, where there is one, one "T2" tutorial); without them (an older API),
 * any linked section of each non-lecture type.
 */
function linkedKinds(main: Section, sections: Section[]): Section[][] {
  const kinds = new Map<string, Section[]>()
  if (main.linkIdentifier) {
    const group = linkGroup(main.linkIdentifier)
    for (const s of sections) {
      if (s === main || !s.linkIdentifier || /^M/i.test(s.linkIdentifier) || linkGroup(s.linkIdentifier) !== group) continue
      kinds.set(s.linkIdentifier.toUpperCase(), [...(kinds.get(s.linkIdentifier.toUpperCase()) ?? []), s])
    }
  } else if (main.isSectionLinked) {
    for (const s of sections) {
      if (s === main || !s.isSectionLinked || isMain(s)) continue
      const kind = s.scheduleType ?? 'Section'
      kinds.set(kind, [...(kinds.get(kind) ?? []), s])
    }
  }
  return [...kinds.keys()].sort().map((k) => kinds.get(k)!)
}

function pickOf(course: RegCourse, section: Section, main: boolean): RegPick {
  return {
    code: course.code,
    title: course.title,
    crn: section.crn,
    section: section.sectionNumber,
    type: section.scheduleType ?? (main ? 'Lecture' : 'Section'),
    main,
    credits: main ? (section.creditHours && section.creditHours > 0 ? section.creditHours : 3) : 0,
    meetings: sectionMeetings(section),
    seats: openSeats(section),
    status: section.status,
    ...(course.slotLabel ? { slotLabel: course.slotLabel } : {}),
  }
}

/** "lab", "tutorial": how a sentence names a section kind. */
function kindWord(section: Section | undefined): string {
  const type = (section?.scheduleType ?? 'section').toLowerCase()
  return type === 'laboratory' ? 'lab' : type
}

/** "CMPT 340, CMPT 353 or CMPT 434". */
function wordList(codes: string[], joiner: 'or' | 'and' = 'or'): string {
  const spaced = unique(codes).map(spacedCode)
  return spaced.length <= 1 ? (spaced[0] ?? '') : `${spaced.slice(0, -1).join(', ')} ${joiner} ${spaced.at(-1)}`
}

type Placement = { ok: true; picks: RegPick[] } | { ok: false; reason: UnplacedReason; text: string; clashes: string[] }

interface Held {
  code: string
  meetings: RegMeeting[]
}

/** Where the sections come from: the request's own term, or another term's timetable for a preview. */
interface Where {
  termLabel: string
  /** 'Fall 2026' when the sections are that term's, standing in for an unpublished term. */
  timetable?: string
}

/** "in Winter 2027", or "on Fall 2026's timetable" for a preview. */
const inTerm = (where: Where) => (where.timetable ? `on ${where.timetable}'s timetable` : `in ${where.termLabel}`)

/**
 * One course's sections: the first open main-campus lecture (in section order) that fits around what's
 * already held, with one open main-campus section of each kind linked to it that fits too. When a
 * lecture's labs don't fit, the next lecture is tried, so the student gets another lecture before a
 * "clash". A lecture whose lab (or tutorial) runs only off the main campus can't be had here at all.
 */
function placeCourse(course: RegCourse, sections: Section[] | undefined, held: Held[], where: Where): Placement {
  const code = spacedCode(course.code)
  if (!sections || sections.length === 0) {
    const text = where.timetable ? `${code} isn't on ${where.timetable}'s timetable` : `USask isn't running ${code} in ${where.termLabel}`
    return { ok: false, reason: 'not-offered', text, clashes: [] }
  }
  const campus = sections.filter(onMainCampus).sort(bySection)
  if (campus.length === 0) {
    return { ok: false, reason: 'not-offered', text: `${code} runs only off the main campus ${inTerm(where)}`, clashes: [] }
  }
  let mains = campus.filter(isMain)
  if (mains.length === 0) mains = campus
  const open = mains.filter(isOpen)
  if (open.length === 0) {
    const waitlist = mains.some((s) => s.status === 'waitlist') ? ' (a waitlist is open)' : ''
    return { ok: false, reason: 'full', text: `All main-campus sections of ${code} are full${waitlist}`, clashes: [] }
  }

  const clashes = new Set<string>()
  let selfClash: string | null = null
  let fullKind: string | null = null
  let offCampusKind: string | null = null
  for (const main of open) {
    const mainMeetings = sectionMeetings(main)
    const against = held.filter((h) => meetingsClash(mainMeetings, h.meetings)).map((h) => h.code)
    if (against.length > 0) {
      against.forEach((c) => clashes.add(c))
      continue
    }
    const chosen: Section[] = [main]
    let fits = true
    for (const kind of linkedKinds(main, sections)) {
      const here = kind.filter(onMainCampus)
      if (here.length === 0) {
        offCampusKind ??= kindWord(kind[0])
        fits = false
        break
      }
      const openKind = here.filter(isOpen).sort(bySection)
      if (openKind.length === 0) {
        fullKind ??= kindWord(kind[0])
        fits = false
        break
      }
      const pick = openKind.find((s) => {
        const m = sectionMeetings(s)
        return !held.some((h) => meetingsClash(m, h.meetings)) && !chosen.some((c) => meetingsClash(m, sectionMeetings(c)))
      })
      if (!pick) {
        for (const s of openKind) {
          const m = sectionMeetings(s)
          const others = held.filter((h) => meetingsClash(m, h.meetings)).map((h) => h.code)
          others.forEach((c) => clashes.add(c))
          if (others.length === 0) selfClash ??= kindWord(s)
        }
        fits = false
        break
      }
      chosen.push(pick)
    }
    if (fits) return { ok: true, picks: chosen.map((s, i) => pickOf(course, s, i === 0)) }
  }

  if (clashes.size > 0) {
    return { ok: false, reason: 'clash', text: `Every open section of ${code} clashes with ${wordList([...clashes].sort())}`, clashes: [...clashes].sort() }
  }
  if (selfClash) {
    return { ok: false, reason: 'clash', text: `No open ${selfClash} of ${code} fits around its lecture`, clashes: [] }
  }
  if (!fullKind && offCampusKind) {
    return { ok: false, reason: 'not-offered', text: `${code}'s ${offCampusKind}s run only off the main campus`, clashes: [] }
  }
  return { ok: false, reason: 'full', text: `Every ${fullKind ?? 'lab'} that goes with an open ${code} lecture is full`, clashes: [] }
}

/** pickRealSchedule's answer, plus the course each slot got (null when none placed), in slot order. */
export interface ScheduleDetail extends Pick<RegPlan, 'picks' | 'booked' | 'unplaced' | 'crns'> {
  slotCodes: (string | null)[]
}

/**
 * pickRealSchedule with the course each slot got. A slot candidate missing from `sectionsByCode` was
 * never looked up and is skipped; one present with no sections isn't running this term. `timetable`
 * names the term the sections are from when it isn't the request's (a preview), for the sentences.
 */
export function placeSchedule(request: RegRequest, sectionsByCode: Record<string, Section[]>, opts: { timetable?: string } = {}): ScheduleDetail {
  const where: Where = { termLabel: request.termLabel, ...(opts.timetable ? { timetable: opts.timetable } : {}) }
  const held: Held[] = []
  const booked: RegPick[] = []
  const taken = new Set<string>()

  // What the student is already registered in blocks its time. Which section they're in isn't known,
  // so it's the first main-campus lecture: an assumption for the schedule view, never registered.
  for (const course of request.booked) {
    taken.add(course.code)
    const lectures = (sectionsByCode[course.code] ?? []).filter((s) => onMainCampus(s) && isMain(s)).sort(bySection)
    if (lectures.length === 0) continue
    const pick = pickOf(course, lectures[0], true)
    booked.push(pick)
    held.push({ code: course.code, meetings: pick.meetings })
  }

  const picks: RegPick[] = []
  const unplaced: Unplaced[] = []
  const hold = (placed: RegPick[]) => {
    picks.push(...placed)
    placed.forEach((p) => held.push({ code: p.code, meetings: p.meetings }))
  }

  for (const course of request.courses) {
    if (taken.has(course.code)) continue
    taken.add(course.code)
    const placement = placeCourse(course, sectionsByCode[course.code], held, where)
    if (placement.ok) hold(placement.picks)
    else unplaced.push({ code: course.code, title: course.title, reason: placement.reason, text: placement.text })
  }

  const slotCodes: (string | null)[] = []
  for (const slot of request.slots) {
    const tried: { course: RegCourse; placement: Placement }[] = []
    let placedCode: string | null = null
    for (const candidate of slot.candidates) {
      if (taken.has(candidate.code) || !(candidate.code in sectionsByCode)) continue
      const course = { ...candidate, slotLabel: slot.label }
      const placement = placeCourse(course, sectionsByCode[candidate.code], held, where)
      if (placement.ok) {
        taken.add(candidate.code)
        hold(placement.picks)
        placedCode = candidate.code
        break
      }
      tried.push({ course, placement })
    }
    slotCodes.push(placedCode)
    if (placedCode) continue

    const first = slot.candidates[0]
    const slotWords = slotPickLabel(slot.label).replace(/^Max's pick for /, '')
    const codes = tried.map((t) => t.course.code)
    const failed = tried.map((t) => t.placement).filter((p): p is Extract<Placement, { ok: false }> => !p.ok)
    const reason: UnplacedReason = failed.some((p) => p.reason === 'clash') ? 'clash' : failed.some((p) => p.reason === 'full') ? 'full' : 'not-offered'
    const text =
      tried.length === 0
        ? `Max couldn't find a course for ${slotWords} that runs ${inTerm(where)}`
        : reason === 'clash'
          ? `No open section of ${wordList(codes)} fits around your other classes for ${slotWords}`
          : reason === 'full'
            ? `Every main-campus section of ${wordList(codes, 'and')} is full, so ${slotWords} stays open`
            : `${wordList(codes, 'and')} ${codes.length === 1 ? "isn't" : "aren't"} ${where.timetable ? 'on the main campus' : 'running on the main campus'} ${inTerm(where)}`
    unplaced.push({ code: first?.code ?? slot.label, title: first?.title ?? slot.label, reason, text, slotLabel: slot.label })
  }

  return { picks, booked, unplaced, crns: picks.map((p) => p.crn), slotCodes }
}

/**
 * One clash-free set of real sections for the request, deterministically: the booked courses' times
 * first, then each named course in order, then each slot's first candidate that places. A course whose
 * lecture or required lab/tutorial can't be had open and clash-free is unplaced with a reason, and
 * none of its sections are picked.
 */
export function pickRealSchedule(
  request: RegRequest,
  sectionsByCode: Record<string, Section[]>,
  opts: { timetable?: string } = {},
): Pick<RegPlan, 'picks' | 'booked' | 'unplaced' | 'crns'> {
  const { picks, booked, unplaced, crns } = placeSchedule(request, sectionsByCode, opts)
  return { picks, booked, unplaced, crns }
}
