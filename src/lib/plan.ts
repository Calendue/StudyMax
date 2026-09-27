import type { Specialization } from '../data/specializations.js'
import type { Degree } from '../data/degrees/types.js'
import { courseInfo } from '../data/prereqs.js'
import { creditPrereqs } from '../data/creditPrereqs.js'
import { offerings as scrapedOfferings } from '../data/offerings.js'
import { computeCourseOverlap, computeMatches, type SpecializationMatch } from './match.js'
import { cuOf, degreeTarget, FREE_ELECTIVE, levelOf, planDegree, SENIOR_ELECTIVE, type DegreeSlot } from './planDegree.js'

// Sources for the load rules below: "Normally students register in a maximum of 30 credit units
// (15 credit units per term) in Fall and Winter Terms" (programs.usask.ca/arts-and-science/
// policies.php, Course Load Regulations), and "Never take 12cu of CMPT courses (or more) in a single
// term at 300- and 400-level" (cs.usask.ca .../templates/bsc-four-year.php).

export { FREE_ELECTIVE }

export interface PlannedCourse {
  code: string
  /**
   * `requirement` — the specialization asks for it directly.
   * `prerequisite` — the specialization doesn't ask for it, but a course that does can't be taken
   * without it. This is the hidden cost of a specialization.
   * `registered` — already being taken; placed in its term for display, never scheduled by the plan.
   * `elective` — an open slot the degree needs filled ("Breadth elective", "Free elective"), with no
   * particular course: its code is an `elective:` placeholder (see isElective/electiveLabel).
   */
  reason: 'requirement' | 'prerequisite' | 'registered' | 'elective'
  /** Names of OTHER specializations this same course also advances — the double-dip payoff. */
  alsoAdvances: string[]
  /** For prerequisites: the course that needs it, and the catalogue's verbatim rule. */
  neededBy?: string
  prerequisiteText?: string
  /** Credit units (the catalogue's; 3 for an unnamed slot). */
  cu?: number
  /** The degree requirement, slot or target it fills ("English writing", "Artificial Intelligence"). */
  group?: string
  /** The advising year (1-4) it's recommended in. */
  year?: number
}

export interface PlannedTerm {
  /** e.g. "Fall 2026" */
  label: string
  courses: PlannedCourse[]
}

export type Season = 'Fall' | 'Winter' | 'Spring/Summer'

// A Spring/Summer term is short (May to August, compressed sessions), so by default it carries a
// light load; the student can set their own cap.
export const DEFAULT_SUMMER_COURSES = 2
/** A full Fall/Winter load: five three-credit courses, the college's 15 credit units. */
export const DEFAULT_COURSES_PER_TERM = 5
/** The Arts & Science Fall/Winter ceiling: 15 credit units a term. */
export const DEFAULT_MAX_CU = 15
/** Senior (300/400-level) CMPT courses a term: the department's "never 12 cu" rule. */
export const DEFAULT_MAX_SENIOR_CMPT = 3

export interface TermStart {
  season: Season
  year: number
}

export interface PlanOptions {
  springSummer?: boolean
  summerPerTerm?: number
  /** The whole degree, where it's mapped: its named requirements, open slots and free electives. */
  degree?: Degree
  /** Courses the student is already taking, by term label ("Winter 2027"). */
  booked?: Record<string, string[]>
  /** The seasons each course runs in (src/data/offerings.ts). */
  offerings?: Record<string, Season[]>
  /** Credit units a Fall/Winter term may hold, booked courses included. */
  maxCu?: number
  /** 300/400-level CMPT courses a term may hold, booked courses included. */
  maxSeniorCmpt?: number
  /** An academic year (by its Fall's calendar year) spent away on an internship: nothing is planned in it. */
  away?: number | null
}

/** An unnamed elective slot in a plan. It has no prerequisites, no catalogue page and no sections. */
export const isElective = (code: string) => code.startsWith('elective:')
/** "elective:3:Breadth elective" → "Breadth elective". */
export const electiveLabel = (code: string) => code.split(':').slice(2).join(':')
const elective = (n: number, label: string, year?: number): PlannedCourse => ({
  code: `elective:${n}:${label}`,
  reason: 'elective',
  alsoAdvances: [],
  cu: 3,
  group: label,
  ...(year ? { year } : {}),
})

/** 3 in "CMPT317". Ranks courses when prerequisites leave the order free. */
export function courseLevel(code: string): number {
  return levelOf(code)
}

const subjectOf = (code: string) => code.match(/^[A-Z]+/)?.[0] ?? ''

/** Every group a course needs: the ones passed in an earlier term, then the ones it may share a term with. */
function prerequisiteGroups(code: string): { options: string[]; concurrent: boolean }[] {
  const info = courseInfo[code]
  return [
    ...(info?.requires ?? []).map((options) => ({ options, concurrent: false })),
    ...(info?.concurrent ?? []).map((options) => ({ options, concurrent: true })),
  ].filter((g) => g.options.length > 0)
}

/** AND-groups of OR-options from the catalogue, minus anything already satisfied or unknown. */
/** "Students with credit for X may not take this course": never planned once X is done or under way. */
const barred = (code: string, done: Set<string>) => (courseInfo[code]?.antirequisites ?? []).some((a) => done.has(a))
/** Has the course, or credit that rules it out (CME 331 for CMPT 215), which stands in for it as a prerequisite. */
const credited = (done: Set<string>, code: string) => done.has(code) || barred(code, done)

function unmetPrerequisites(code: string, satisfied: Set<string>): string[][] {
  return prerequisiteGroups(code)
    .map((g) => g.options)
    .filter((options) => !options.some((option) => credited(satisfied, option)))
}

/**
 * Orders a slot's options, best first: (a) the program recommends or lists it (a degree group's
 * `prefer`, then any program list), (b) it's in the 2026-27 catalogue, (c) it's offered (Banner, or
 * the catalogue's `offered`), (d) it advances more other targets, (e) it's in the program's own
 * subjects (CMPT, MATH, STAT for CS, not CME or EE), (f) fewest unmet prerequisites counting what's
 * planned anyway, then level, list order and code.
 */
export type OptionRanker = (options: string[], exceptSpecId?: string, planned?: Set<string>) => string[]

export function optionRanker(
  lists: Specialization[],
  completed: Set<string>,
  targets: SpecializationMatch[] = [],
  offerings: Record<string, Season[]> = scrapedOfferings,
  honours = false,
): OptionRanker {
  const preferRank = new Map<string, number>()
  const listed = new Set<string>()
  // "CMPT 260 or CMPT 263": once one is planned, the other is its alternative, not a second pick.
  const choiceGroups: string[][] = []
  const core = new Set<string>()
  // Planned anyway: completed, and every course a program asks for by name with no choice.
  const likely = new Set(completed)
  for (const spec of [...lists, ...targets.map((t) => t.spec)]) {
    for (const group of spec.requirements) {
      group.courses.forEach((c) => listed.add(c))
      group.prefer?.forEach((c, i) => preferRank.set(c, Math.min(preferRank.get(c) ?? i, i)))
      if (!group.label && group.courses.length > 0) core.add(subjectOf(group.prefer?.[0] ?? group.courses[0]))
      if (!group.label && group.courses.length <= group.need) group.courses.forEach((c) => likely.add(c))
      if (!group.label && group.need === 1 && group.courses.length > 1) choiceGroups.push(group.courses)
    }
  }
  const overlap = new Map(computeCourseOverlap(lists, completed).map((o) => [o.course, o.specs]))
  const standingOk = (code: string) => honours || ![...(creditPrereqs[code] ?? []), ...(courseInfo[code]?.creditRequires ?? [])].some((r) => r.standing === 'honours')
  // How surely it runs: sections in USask's class search (2025-27) beat a catalogue listing alone,
  // which can outlive the course (CMPT 260 is still "Term 1 only" in the catalogue, with no sections).
  const runs = (code: string) =>
    !standingOk(code) ? 0 : (offerings[code]?.length ?? 0) > 0 ? 2 : courseInfo[code]?.offered && courseInfo[code]?.offered !== 'none' ? 1 : 0
  const programRank = (code: string) => preferRank.get(code) ?? (listed.has(code) ? 100 : 200)

  return (options, exceptSpecId, planned) => {
    const position = new Map(options.map((c, i) => [c, i]))
    const advances = (code: string) => (overlap.get(code) ?? []).filter((s) => s.id !== exceptSpecId).length
    // ...and one not offered beside an alternative that is (CMPT 260, replaced by CMPT 263) is never picked
    // on the strength of that list.
    const superseded = (code: string) =>
      choiceGroups.some(
        (g) => g.includes(code) && g.some((c) => c !== code && (planned?.has(c) || runs(code) < runs(c))),
      )
    return [...options].sort(
      (a, b) =>
        Number(superseded(a)) - Number(superseded(b)) ||
        programRank(a) - programRank(b) ||
        Number(!courseInfo[a]) - Number(!courseInfo[b]) ||
        runs(b) - runs(a) ||
        advances(b) - advances(a) ||
        Number(!core.has(subjectOf(a))) - Number(!core.has(subjectOf(b))) ||
        unmetPrerequisites(a, likely).length - unmetPrerequisites(b, likely).length ||
        levelOf(a) - levelOf(b) ||
        position.get(a)! - position.get(b)! ||
        a.localeCompare(b),
    )
  }
}

/**
 * Picks the concrete courses that close out the unsatisfied requirement slots of one target — or of
 * several planned together, in which case a course shared between them is planned once and counted
 * for each.
 *
 * Where a slot offers a choice ("CMPT260 or CMPT263"), the program's own pick wins, then the option
 * that advances the most OTHER specializations — one course, two credentials (see optionRanker).
 *
 * Most-constrained slots are filled first so a shared course is never stolen by a slot that had
 * other options left.
 */
export function selectCourses(
  target: SpecializationMatch | SpecializationMatch[],
  allSpecializations: Specialization[],
  completed: Set<string>,
  /** A target that ranks picks but isn't named in "also counts toward" (the degree itself). */
  quietId?: string,
  rank: OptionRanker = optionRanker(allSpecializations, completed, Array.isArray(target) ? target : [target]),
): PlannedCourse[] {
  const targets = Array.isArray(target) ? target : [target]
  const overlap = computeCourseOverlap(allSpecializations, completed)
  const overlapByCourse = new Map(overlap.map((o) => [o.course, o.specs]))

  const picked: PlannedCourse[] = []
  const pickedCodes = new Set<string>()
  // One course fills a slot in every target at once — that is the whole point of planning several
  // together — but never two slots of the SAME target, which would double-count it.
  const claimed = new Map<string, Set<string>>()
  const claimedBy = (specId: string) => {
    if (!claimed.has(specId)) claimed.set(specId, new Set())
    return claimed.get(specId)!
  }

  const slots = targets
    .flatMap((t) => t.unsatisfied.map((slot) => ({ ...slot, specId: t.spec.id, specName: t.spec.name })))
    .sort((a, b) => a.options.length - b.options.length)

  for (const slot of slots) {
    const mine = claimedBy(slot.specId)

    // A course another target already put in the plan counts for this slot too — for free.
    let need = slot.need
    for (const code of slot.options) {
      if (need === 0) break
      if (!pickedCodes.has(code) || mine.has(code)) continue
      mine.add(code)
      need--
    }
    if (need === 0) continue

    // An open choice isn't pinned to one course: it stays an unnamed slot the student fills.
    if (slot.label) {
      for (let i = 0; i < need; i++) picked.push(elective(picked.length, slot.label))
      continue
    }

    // Never a course the 2026-27 catalogue doesn't list (BINF 451): a slot with no live option stays
    // unplanned, and the specialization says why it can't be finished (Specialization.unavailable).
    const ranked = rank(
      slot.options.filter((code) => !pickedCodes.has(code) && courseInfo[code] !== undefined && !barred(code, completed)),
      slot.specId,
    )

    for (const code of ranked.slice(0, need)) {
      mine.add(code)
      pickedCodes.add(code)
      picked.push({
        code,
        reason: 'requirement',
        alsoAdvances: (overlapByCourse.get(code) ?? [])
          .filter((s) => s.id !== slot.specId && s.id !== quietId)
          .map((s) => s.name),
        cu: cuOf(code),
        ...(slot.specId !== quietId ? { group: slot.specName } : {}),
      })
    }
  }

  return picked
}

/**
 * Walks the catalogue prerequisite graph and adds every course the student still needs in order to
 * be allowed to register for the ones the specialization actually requires.
 *
 * Where a prerequisite offers alternatives, one already planned or passed wins; otherwise the
 * ranking of selectCourses (a program-listed, catalogued, offered option first).
 */
export function withPrerequisites(
  picked: PlannedCourse[],
  completed: Set<string>,
  rank: OptionRanker = optionRanker([], completed),
): PlannedCourse[] {
  const result = [...picked]
  const satisfied = new Set([...completed, ...picked.map((p) => p.code)])
  const queue = picked.map((p) => p.code)
  const seen = new Set(queue)

  while (queue.length > 0) {
    const code = queue.shift()!
    for (const options of unmetPrerequisites(code, satisfied)) {
      // An option the student's credit rules out isn't planned; with none left, it's the
      // department's call (CME 331 standing in for CMPT 215), not a course to add.
      const allowed = options.filter((o) => !barred(o, completed))
      if (allowed.length === 0) continue
      const choice = rank(allowed, undefined, satisfied)[0]
      if (seen.has(choice)) continue

      seen.add(choice)
      satisfied.add(choice)
      result.push({
        code: choice,
        reason: 'prerequisite',
        alsoAdvances: [],
        neededBy: code,
        prerequisiteText: courseInfo[code]?.prerequisiteText,
        cu: cuOf(choice),
      })
      queue.push(choice)
    }
  }

  return result
}

export function nextTerm({ season, year }: TermStart, springSummer = false): TermStart {
  // USask runs Fall (Sept, year Y) then Winter (Jan, year Y+1), with an optional Spring/Summer
  // (May, year Y+1) between Winter and the next Fall.
  if (season === 'Fall') return { season: 'Winter', year: year + 1 }
  if (season === 'Winter' && springSummer) return { season: 'Spring/Summer', year }
  return { season: 'Fall', year }
}

/** Terms in calendar order: Winter, then Spring/Summer, then Fall, within a year. */
/** The academic year a term belongs to, by its Fall: Fall 2026, Winter 2027 and Spring/Summer 2027 are 2026. */
export function academicYearOf({ season, year }: TermStart): number {
  return season === 'Fall' ? year : year - 1
}

function termOrder({ season, year }: TermStart): number {
  return year * 10 + (season === 'Winter' ? 0 : season === 'Spring/Summer' ? 1 : 2)
}

function termFromLabel(label: string): TermStart | null {
  const match = label.match(/^(Fall|Winter|Spring\/Summer) (\d{4})$/)
  return match ? { season: match[1] as Season, year: Number(match[2]) } : null
}

/** The catalogue's `offered` as seasons (a full-year course starts in Fall). */
const CATALOGUE_SEASONS: Record<string, Season[]> = {
  fall: ['Fall'],
  winter: ['Winter'],
  either: ['Fall', 'Winter'],
  'full-year': ['Fall'],
  'spring-summer': ['Spring/Summer'],
}

/** Whether a course runs in a season: Banner's offerings first, then the catalogue, else anywhere. */
export function courseRunsIn(code: string, season: Season, springSummer = false, offerings: Record<string, Season[]> = scrapedOfferings): boolean {
  // No 300- or 400-level CMPT course ran in a Spring/Summer term in 2025-27 (USask's class search).
  if (isElective(code)) return season !== 'Spring/Summer' || !/410 or higher|senior cmpt/i.test(electiveLabel(code))
  const usable = (seasons: Season[]) => seasons.filter((s) => springSummer || s !== 'Spring/Summer')
  const banner = usable(offerings[code] ?? [])
  if (banner.length > 0) return banner.includes(season)
  const catalogue = usable(CATALOGUE_SEASONS[courseInfo[code]?.offered ?? ''] ?? [])
  // Neither source says: anywhere rather than never.
  return catalogue.length === 0 || catalogue.includes(season)
}

/** Whether a course's prerequisite groups are met: `before` passed earlier, `alongside` this same term (corequisites). */
export function prerequisitesMet(code: string, before: ReadonlySet<string>, alongside: ReadonlySet<string>): boolean {
  return prerequisiteGroups(code).every((g) => g.options.some((o) => before.has(o) || (g.concurrent && alongside.has(o))))
}

/** A course in the plan, with what the scheduler needs to know about it. */
interface Item {
  course: PlannedCourse
  named: boolean
  cu: number
  level: number
  seniorCmpt: boolean
  /** Advising year, pulled ahead of what depends on it. */
  due: number
  /** Longest chain of planned courses waiting on this one. */
  chain: number
  order: number
}

// Past this many terms with nothing placeable, the scheduler stops honouring, in turn, the term
// offerings, then the level and credit gates, then the prerequisites: a course the catalogue can't
// sequence is still shown, in a capped term, never dropped.
const RELAX_AFTER = [6, 8, 10]
const MAX_TERMS = 80

/**
 * Spreads the courses across terms, `coursesPerTerm` at a time (`summerPerTerm` in a Spring/Summer
 * term), under the college's 15-credit-unit ceiling and at most three senior CMPT courses a term.
 * A course goes in a term that runs it, after its prerequisites (a corequisite may share the term),
 * once its credit-unit prerequisites are met, and at the 300 level only after 30 credit units (400:
 * 60). Within a term, what's overdue for its advising year goes first, then the longest prerequisite
 * chain, so a plan reads like the department's template and never leaves a seat empty that
 * something could fill.
 *
 * `booked` holds courses the student is already taking, by term label ("Winter 2027"). They take up
 * room in their term, so the plan only adds what's left of the term's limits there, and they only
 * count as passed once their term is over.
 */
export function buildPlan(
  target: SpecializationMatch | SpecializationMatch[],
  allSpecializations: Specialization[],
  completed: Set<string>,
  coursesPerTerm: number,
  start: TermStart,
  {
    includePrerequisites = true,
    springSummer = false,
    summerPerTerm = DEFAULT_SUMMER_COURSES,
    degree,
    booked = {},
    offerings = scrapedOfferings,
    maxCu = DEFAULT_MAX_CU,
    maxSeniorCmpt = DEFAULT_MAX_SENIOR_CMPT,
    away = null,
  }: PlanOptions & { includePrerequisites?: boolean } = {},
): PlannedTerm[] {
  const perTerm = Math.max(1, Math.floor(coursesPerTerm))
  const perSummer = Math.max(1, Math.floor(summerPerTerm))
  const targets = Array.isArray(target) ? target : [target]
  const program = degree ? planDegree(degree) : null
  const honours = program?.honours ?? false
  const rank = optionRanker(allSpecializations, completed, targets, offerings, honours)

  const picked = selectCourses(targets, allSpecializations, completed, degree?.id, rank)
  const real = picked.filter((c) => !isElective(c.code))
  const named = includePrerequisites ? withPrerequisites(real, completed, rank) : real
  const namedCodes = new Set(named.map((c) => c.code))

  // With a degree, its open slots are counted after the prerequisites are in: a prerequisite can
  // fill one itself (BIOL 120 for BINF 451 is also a science course).
  const slots: DegreeSlot[] = program
    ? program.slots(new Set([...completed, ...named.map((c) => c.code)]))
    : picked.filter((c) => isElective(c.code)).map((c) => ({ label: electiveLabel(c.code), level: 1, seniorCmpt: false, free: false }))

  const bookedTerms = Object.entries(booked).flatMap(([label, codes]) => {
    const t = termFromLabel(label)
    return t ? [{ order: termOrder(t), codes, done: false }] : []
  })
  // A booked course isn't passed until its term ends, whatever `completed` assumes.
  const bookedCodes = new Set(bookedTerms.flatMap((b) => b.codes))
  const passed = new Set([...completed].filter((code) => !bookedCodes.has(code)))
  // Credit units toward the level gates and the plan year. Without a degree the plan holds only a
  // target's courses, so each Fall/Winter term is assumed full of the student's other courses.
  let gateCu = [...passed].reduce((n, c) => n + cuOf(c), 0)
  const planYear = () => Math.floor(gateCu / 30) + 1

  // --- the items: named courses, then the degree's slots, then free electives ---
  const dependants = new Map<string, { code: string; concurrent: boolean }[]>()
  for (const c of named) {
    for (const g of prerequisiteGroups(c.code)) {
      if (g.options.some((o) => passed.has(o) && !bookedCodes.has(o))) continue
      for (const o of g.options) {
        if (!namedCodes.has(o) && !bookedCodes.has(o)) continue
        dependants.set(o, [...(dependants.get(o) ?? []), { code: c.code, concurrent: g.concurrent }])
      }
    }
  }
  const tagYear = (code: string) => program?.yearOf(code) ?? Math.min(4, Math.max(1, levelOf(code)))
  const chainMemo = new Map<string, number>()
  const chain = (code: string, depth = 0): number => {
    if (chainMemo.has(code)) return chainMemo.get(code)!
    if (depth > 40) return 0
    const next = (dependants.get(code) ?? []).filter((d) => namedCodes.has(d.code))
    const n = next.length === 0 ? 0 : 1 + Math.max(...next.map((d) => chain(d.code, depth + 1)))
    chainMemo.set(code, n)
    return n
  }
  // A prerequisite is due a year before what needs it (a corequisite, the same year), so the chain
  // to STAT 242 in Year 2 starts with MATH 116 in Year 1.
  const dueMemo = new Map<string, number>()
  const due = (code: string, depth = 0): number => {
    if (dueMemo.has(code)) return dueMemo.get(code)!
    let year = tagYear(code)
    if (depth <= 40) {
      for (const d of dependants.get(code) ?? []) {
        if (namedCodes.has(d.code)) year = Math.min(year, due(d.code, depth + 1) - (d.concurrent ? 0 : 1))
      }
    }
    year = Math.max(1, year)
    dueMemo.set(code, year)
    return year
  }

  const items: Item[] = named.map((course, i) => ({
    course: {
      ...course,
      cu: cuOf(course.code),
      year: program?.yearOf(course.code) ?? due(course.code),
      ...(course.group ? {} : program?.groupOf(course.code) ? { group: program.groupOf(course.code) } : {}),
    },
    named: true,
    cu: cuOf(course.code),
    level: levelOf(course.code),
    seniorCmpt: subjectOf(course.code) === 'CMPT' && levelOf(course.code) >= 3,
    due: due(course.code),
    chain: chain(course.code),
    order: i,
  }))

  // Free electives are due round-robin from Year 2 (Year 1 is the advising sheet's) to the year
  // before the last, and take turns with the degree's own open slots, so they aren't left to fill
  // whatever the last year has room for.
  const plannedCu = items.reduce((n, i) => n + i.cu, 0) + slots.length * 3
  const firstYear = planYear()
  const lastYear = Math.max(firstYear, Math.floor((gateCu + plannedCu - 1) / 30) + 1)
  const freeYears: number[] = []
  const fromYear = Math.max(firstYear, Math.min(2, lastYear))
  for (let y = fromYear; y <= Math.max(fromYear, lastYear - 1); y++) freeYears.push(y)
  let freeIndex = 0
  let slotIndex = 0
  slots.forEach((slot, i) => {
    const year = slot.free ? freeYears[freeIndex % freeYears.length] : (slot.year ?? firstYear)
    const turn = slot.free ? 2 * freeIndex++ + 1 : 2 * slotIndex++
    items.push({
      course: elective(i, slot.label, year),
      named: false,
      cu: 3,
      level: slot.level,
      seniorCmpt: slot.seniorCmpt,
      due: year,
      chain: 0,
      order: named.length + turn,
    })
  })

  // --- whether a course may go in a term ---
  const runsIn = (code: string, season: Season) => courseRunsIn(code, season, springSummer, offerings)
  const creditsMet = (code: string) =>
    [...(creditPrereqs[code] ?? []), ...(courseInfo[code]?.creditRequires ?? [])].every((rule) => {
      if (rule.standing === 'honours' && !honours) return false
      let cu = 0
      for (const c of passed) {
        if (rule.subjects && !rule.subjects.includes(subjectOf(c))) continue
        if (rule.level && levelOf(c) * 100 !== rule.level) continue
        cu += cuOf(c)
      }
      return cu >= rule.cu
    })

  // Slack: the latest Fall/Winter term each named course can go in without the plan running past
  // the terms its courses fill, worked back from what needs it and the seasons each runs in. A
  // course with none left goes first: AI's MATH 116 → STAT 241 → STAT 242 → CMPT 317 → CMPT 423 →
  // CMPT 489 runs in one term each, so MATH 116 can't wait for Year 2 the way the sheet's Year-1
  // writing, Indigenous learning and science can't wait for Year 3.
  const fwIndex = (t: TermStart) => t.year * 2 + (t.season === 'Fall' ? 1 : 0)
  const base = fwIndex(start.season === 'Spring/Summer' ? { season: 'Fall', year: start.year } : start)
  const seasonAt = (i: number): Season => ((base + i) % 2 === 1 ? 'Fall' : 'Winter')
  const bookedAhead = bookedTerms.filter((b) => b.order >= termOrder(start)).reduce((n, b) => n + b.codes.length, 0)
  const horizon = Math.max(1, Math.ceil((items.length + bookedAhead) / perTerm))
  const latestMemo = new Map<string, number>()
  const latest = (code: string, depth = 0): number => {
    if (latestMemo.has(code)) return latestMemo.get(code)!
    let bound = horizon - 1
    if (depth <= 40) {
      for (const d of dependants.get(code) ?? []) {
        if (namedCodes.has(d.code)) bound = Math.min(bound, latest(d.code, depth + 1) - (d.concurrent ? 0 : 1))
      }
    }
    while (bound >= 0 && !runsIn(code, seasonAt(bound))) bound--
    latestMemo.set(code, bound)
    return bound
  }
  const critical = (item: Item, at: number) => item.named && latest(item.course.code) <= at
  const isLooseSlot = (item: Item) =>
    !item.named && ([FREE_ELECTIVE, SENIOR_ELECTIVE].includes(electiveLabel(item.course.code)) || /^breadth/i.test(electiveLabel(item.course.code)))

  const terms: PlannedTerm[] = []
  let pending = [...items]
  let term = start
  let idle = 0

  for (let guard = 0; pending.length > 0 && guard < MAX_TERMS; guard++) {
    // Courses booked in earlier terms (including ones this plan skips) are finished by now.
    for (const b of bookedTerms) {
      if (b.done || b.order >= termOrder(term)) continue
      b.done = true
      for (const code of b.codes) {
        if (passed.has(code)) continue
        passed.add(code)
        gateCu += cuOf(code)
      }
    }
    if (away !== null && academicYearOf(term) === away) {
      // On the internship: what this year would have held moves on to the terms after it. Not idle
      // time, so the load rules don't start relaxing.
      term = nextTerm(term, springSummer)
      continue
    }
    const label = `${term.season} ${term.year}`
    const summer = term.season === 'Spring/Summer'
    const here = booked[label] ?? []
    const hereCu = here.reduce((n, c) => n + cuOf(c), 0)
    const limit = (summer ? perSummer : perTerm) - here.length
    const cuCap = (summer ? 3 * perSummer : maxCu) - hereCu
    const seniorCap = maxSeniorCmpt - here.filter((c) => subjectOf(c) === 'CMPT' && levelOf(c) >= 3).length
    const relax = RELAX_AFTER.filter((n) => idle >= n).length
    const year = planYear()

    const chosen: Item[] = []
    let termCu = 0
    let senior = 0
    const fits = (item: Item, seniorLimit: number) => {
      if (chosen.includes(item)) return false
      // One course bigger than the ceiling still goes in a term of its own.
      if (termCu + item.cu > cuCap && (chosen.length > 0 || here.length > 0)) return false
      if (item.seniorCmpt && senior >= seniorLimit && relax < 3) return false
      if (!item.named) {
        if (relax >= 2) return true
        if (!runsIn(item.course.code, term.season)) return false
        // An unnamed senior CMPT slot waits for the plan's 200-level CMPT courses, which every
        // 300-level CMPT course needs.
        if (item.seniorCmpt && pending.some((p) => p.named && p.level === 2 && subjectOf(p.course.code) === 'CMPT')) return false
        return item.level < 3 || gateCu >= (item.level >= 4 ? 60 : 30)
      }
      const code = item.course.code
      if (relax < 1 && !runsIn(code, term.season)) return false
      if (relax < 2) {
        if (item.level === 3 && gateCu < 30) return false
        if (item.level >= 4 && gateCu < 60) return false
        if (!creditsMet(code)) return false
      }
      if (relax < 3) {
        const alongside = new Set([...passed, ...chosen.map((c) => c.course.code)])
        for (const g of prerequisiteGroups(code)) {
          if (!g.options.some((o) => credited(passed, o) || (g.concurrent && alongside.has(o)))) return false
        }
      }
      return true
    }
    if (limit > 0) {
      const at = fwIndex(term) - base
      const ordered = [...pending].sort(
        (a, b) =>
          Number(critical(b, at)) - Number(critical(a, at)) ||
          Number(a.due > year) - Number(b.due > year) ||
          // The advising sheet's own year before chain length: Year 1's writing, Indigenous learning and
          // science keep their seats ahead of a Year-2 chain's prerequisite (MATH 116 for STAT 242).
          (a.course.year ?? a.due) - (b.course.year ?? b.due) ||
          // A Year-2 requirement's slot (the third science, business) before a free elective of the same
          // year; breadth takes turns with free electives (the sheet's Year 2 is 'business, breadth or science').
          Number(isLooseSlot(a)) - Number(isLooseSlot(b)) ||
          b.chain - a.chain ||
          a.due - b.due ||
          Number(!a.named) - Number(!b.named) ||
          (a.named && b.named ? a.level - b.level : 0) ||
          a.order - b.order,
      )
      // A course that runs in only one of Fall and Winter loses a whole year if it waits.
      const scarce = (i: Item) => {
        if (!i.named) return false
        const seasons = (['Fall', 'Winter'] as Season[]).filter((season) => runsIn(i.course.code, season))
        return seasons.length === 1
      }
      // Senior CMPT courses are paced over what's left of the plan: at most three a term, their share
      // placed first (they can't catch up later, three a term being the most), then everything else.
      const seniorLeft = pending.filter((i) => i.seniorCmpt).length
      const termsLeft = Math.max(1, Math.ceil(pending.length / perTerm))
      const share = Math.min(seniorCap, Math.max(1, Math.ceil(seniorLeft / termsLeft)))
      const passes: [Item[], number][] = [
        [ordered.filter((i) => i.seniorCmpt), share],
        [ordered.filter((i) => i.seniorCmpt && scarce(i)), seniorCap],
        [ordered, share],
        [ordered, seniorCap],
      ]
      for (const [candidates, seniorLimit] of passes) {
        // Repeated passes: a corequisite placed this term can unlock a course earlier in the order.
        for (let grew = true; grew && chosen.length < limit; ) {
          grew = false
          for (const item of candidates) {
            if (chosen.length >= limit) break
            if (!fits(item, seniorLimit)) continue
            chosen.push(item)
            termCu += item.cu
            if (item.seniorCmpt) senior++
            grew = true
          }
        }
      }
    }

    if (!degree && !summer) gateCu += Math.max(0, 3 * perTerm - hereCu - chosen.reduce((n, i) => n + i.cu, 0))
    if (chosen.length === 0) {
      idle++
      term = nextTerm(term, springSummer)
      continue
    }
    idle = 0
    terms.push({ label, courses: chosen.map((i) => i.course) })
    for (const item of chosen) {
      passed.add(item.course.code)
      gateCu += item.cu
    }
    pending = pending.filter((i) => !chosen.includes(i))
    term = nextTerm(term, springSummer)
  }

  // Never an uncapped catch-all term: anything left (only after MAX_TERMS) goes on at the cap.
  while (pending.length > 0) {
    const cap = term.season === 'Spring/Summer' ? perSummer : perTerm
    terms.push({ label: `${term.season} ${term.year}`, courses: pending.slice(0, cap).map((i) => i.course) })
    pending = pending.slice(cap)
    term = nextTerm(term, springSummer)
  }

  return terms
}

/**
 * The plan from the student's own state, starting in the term they chose.
 *
 * In-progress courses are assumed finished by `start` (or by the end of their own term, when
 * `booked` says which): never planned again, and they unlock their dependants. Targets are
 * re-matched against that, so a slot an in-progress course already fills drops out — and a target it
 * finishes outright yields no terms.
 */
export function buildStudentPlan(
  targets: Specialization[],
  allSpecializations: Specialization[],
  completed: Set<string>,
  inProgress: Iterable<string>,
  coursesPerTerm: number,
  start: TermStart,
  options: PlanOptions = {},
): PlannedTerm[] {
  const { degree } = options
  const done = new Set([...completed, ...inProgress])
  // With the degree mapped, the plan is the whole degree: the targets and the degree's own slots
  // together, so every pick has to fit the degree too, and its open slots become unnamed electives.
  const whole = degree ? degreeTarget(degree) : null
  const open = computeMatches(whole ? [...targets, whole] : targets, done).filter((m) => m.remaining > 0)
  if (!degree && open.length === 0) return []
  return buildPlan(open, whole ? [...allSpecializations, whole] : allSpecializations, done, coursesPerTerm, start, options)
}

/** `count` consecutive terms from `start`, for a start-term picker. */
export function termsFrom(start: TermStart, count: number): TermStart[] {
  const terms = [start]
  while (terms.length < count) terms.push(nextTerm(terms[terms.length - 1]))
  return terms
}

/** The term a student starting now would register for: Fall if it's still before September. */
export function upcomingTerm(today: Date): TermStart {
  const month = today.getMonth() // 0 = January
  return month < 8 ? { season: 'Fall', year: today.getFullYear() } : { season: 'Winter', year: today.getFullYear() + 1 }
}

/** The term being sat now: the one before the term a student would register for next. */
export function currentTermOf(today: Date): TermStart {
  const next = upcomingTerm(today)
  return next.season === 'Fall' ? { season: 'Winter', year: next.year } : { season: 'Fall', year: next.year - 1 }
}

/** The next Fall: where a student with nothing taken or under way starts (Fall 2027 on 2026-09-26). */
export function nextFall(today: Date): TermStart {
  const upcoming = upcomingTerm(today)
  return upcoming.season === 'Fall' ? upcoming : { season: 'Fall', year: upcoming.year }
}
