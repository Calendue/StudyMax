import type { Specialization } from '../data/specializations.js'
import type { Degree } from '../data/degrees/types.js'
import { courseInfo } from '../data/prereqs.js'
import { creditPrereqs } from '../data/creditPrereqs.js'
import { offerings as scrapedOfferings } from '../data/offerings.js'
import { computeCourseOverlap, computeMatches, type SpecializationMatch } from './match.js'
import { cuOf, degreeTarget, FREE_ELECTIVE, levelOf, planDegree, SENIOR_ELECTIVE, type DegreeSlot } from './planDegree.js'
import type { CourseOverride } from './overrides.js'
import type { Catalog, Diagnostic, BindingKind } from './planner/types.js'
import { clampLoad, clampSummer } from './planner/loads.js'
import { defaultCatalog } from './catalog.js'
import { buildModel, spaced, type ModelCourse } from './planner/model.js'
import { coreLowerBound, scheduleCore } from './planner/schedule.js'
import { forcedRanker, jointSelect, type Attempt, type Choice } from './planner/select.js'
import { bindingText } from './planner/explain.js'
export { bindingText }
import { applyOverrides } from './overrides.js'
import { auditDegree } from './degree.js'
export { FW_LOADS, SUMMER_LOADS, MAX_FW_LOAD, MAX_SUMMER_LOAD, clampLoad, clampSummer, summerLoadOf } from './planner/loads.js'

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
  /** A full-year course (CMPT 400): listed in its Fall, it also holds a seat in the next Winter. */
  fullYear?: boolean
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
  /** Failed / withdrew / not-offered / later (src/lib/overrides.ts), applied before planning. */
  overrides?: CourseOverride[]
  /** The term being sat now, for validating overrides; defaults to the term before `start`. */
  currentTerm?: TermStart
  /** The course data; defaults to defaultCatalog() (src/lib/catalog.ts). */
  catalog?: Catalog
  /** Deterministic search budget, in nodes. */
  nodeBudget?: number
}

/** What the UI reads beside the terms: when, how sure, what sets the date, and what couldn't be placed. */
export interface PlanResult {
  terms: PlannedTerm[]
  /** The last term holding a planned or booked course ("Winter 2031"); null with nothing left. */
  graduation: string | null
  optimality: 'proven' | 'best-found'
  /** "Graduation set by MATH 116 → STAT 241 → STAT 242 → CMPT 317 → CMPT 423 → CMPT 489". */
  binding: string
  bindingKind: BindingKind
  /** Errors (unplaceable courses), warnings, and override notes, in a canonical order. */
  diagnostics: Diagnostic[]
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
        (a < b ? -1 : a > b ? 1 : 0),
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

/** What one plan run produced, before it's shaped for the UI. */
interface PlanRun {
  terms: PlannedTerm[]
  graduation: string | null
  optimality: 'proven' | 'best-found'
  binding: string
  bindingKind: BindingKind
  diagnostics: Diagnostic[]
}

/**
 * Whether a course runs in a season, from the same Catalog the planner schedules with (Banner, then
 * the catalogue). A course neither source dates runs in Fall or Winter, never silently anywhere (the
 * planner flags it "offering unconfirmed"). Max's live replanning checks moves with this.
 */
export function courseRunsIn(code: string, season: Season, springSummer = false, offerings?: Record<string, Season[]>, catalog: Catalog = defaultCatalog()): boolean {
  if (season === 'Spring/Summer' && !springSummer) return false
  // No 300- or 400-level CMPT course ran in a Spring/Summer term in 2025-27 (USask's class search).
  if (isElective(code)) return season !== 'Spring/Summer' || !/410 or higher|senior cmpt/i.test(electiveLabel(code))
  const listed = offerings?.[code]
  const seasons = listed && listed.length > 0 ? listed : (catalog[code]?.seasons ?? [])
  if (seasons.length === 0) return season !== 'Spring/Summer'
  return seasons.includes(season)
}

/** Whether a course's prerequisite groups are met: `before` passed earlier, `alongside` this same term (corequisites). */
export function prerequisitesMet(code: string, before: ReadonlySet<string>, alongside: ReadonlySet<string>, catalog: Catalog = defaultCatalog()): boolean {
  const c = catalog[code]
  if (!c) return prerequisiteGroups(code).every((g) => g.options.some((o) => before.has(o) || (g.concurrent && alongside.has(o))))
  const credited = (o: string) => before.has(o) || (catalog[o]?.antirequisites ?? []).some((a) => before.has(a))
  return c.requires.every((g) => g.some(credited)) && c.concurrent.every((g) => g.some((o) => credited(o) || alongside.has(o)))
}

/**
 * Spreads the courses across terms, `coursesPerTerm` at a time (`summerPerTerm` in a Spring/Summer
 * term), under the college's 15-credit-unit ceiling and at most three senior CMPT courses a term:
 * the earliest graduation the hard rules allow (src/lib/planner/schedule.ts), found exactly.
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
  options: PlanOptions & { includePrerequisites?: boolean; blocked?: Record<string, readonly string[]> } = {},
): PlannedTerm[] {
  return runPlan(target, allSpecializations, completed, coursesPerTerm, start, options).terms
}

function runPlan(
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
    catalog = defaultCatalog(),
    nodeBudget,
    blocked = {},
  }: PlanOptions & { includePrerequisites?: boolean; blocked?: Record<string, readonly string[]> } = {},
): PlanRun {
  const perTerm = clampLoad(coursesPerTerm)
  const perSummer = springSummer ? clampSummer(summerPerTerm ?? DEFAULT_SUMMER_COURSES) : 0
  const targets = Array.isArray(target) ? target : [target]
  const program = degree ? planDegree(degree) : null
  const honours = program?.honours ?? false
  const rank0 = optionRanker(allSpecializations, completed, targets, offerings, honours)
  const cache = new Map<string, Attempt<PlanRun>>()
  // A swap keeps the plan's size: one course for another, never a requirement dropped with it.
  let baseCount = -1
  let baseDropped = 0

  // One selection, planned: the ranker's order with the forced choices first (src/lib/planner/select.ts).
  const attempt = (force: ReadonlyMap<string, string>, beat: number): Attempt<PlanRun> | null => {
    const choices: Choice[] = []
    const rank = forcedRanker(rank0, force, choices)
    const picked = selectCourses(targets, allSpecializations, completed, degree?.id, rank)
    const real = picked.filter((c) => !isElective(c.code))
    const named = includePrerequisites ? withPrerequisites(real, completed, rank) : real
    const namedCodes = new Set(named.map((c) => c.code))
    const signature = named.map((c) => c.code).sort().join(',')
    const cached = cache.get(signature)
    if (cached) return cached

    // With a degree, its open slots are counted after the prerequisites are in: a prerequisite can
    // fill one itself (BIOL 120 for BINF 451 is also a science course).
    const slots: DegreeSlot[] = program
      ? program.slots(new Set([...completed, ...named.map((c) => c.code)]))
      : picked.filter((c) => isElective(c.code)).map((c) => ({ label: electiveLabel(c.code), level: 1, seniorCmpt: false, free: false }))

    // A booked course isn't passed until its term ends, whatever `completed` assumes.
    const bookedCodes = new Set(Object.values(booked).flat())
    const passed = new Set([...completed].filter((code) => !bookedCodes.has(code)))
    let gateCu = 0
    for (const c of passed) gateCu += cuOf(c)

    // Advising year: a prerequisite is due a year before what needs it (a corequisite, the same year).
    const dependants = new Map<string, { code: string; concurrent: boolean }[]>()
    for (const c of named) {
      for (const g of prerequisiteGroups(c.code)) {
        if (g.options.some((o) => passed.has(o))) continue
        for (const o of g.options) {
          if (!namedCodes.has(o)) continue
          dependants.set(o, [...(dependants.get(o) ?? []), { code: c.code, concurrent: g.concurrent }])
        }
      }
    }
    const tagYear = (code: string) => program?.yearOf(code) ?? Math.min(4, Math.max(1, levelOf(code)))
    const dueMemo = new Map<string, number>()
    const due = (code: string, depth = 0): number => {
      if (dueMemo.has(code)) return dueMemo.get(code)!
      let year = tagYear(code)
      if (depth <= 40) {
        for (const d of dependants.get(code) ?? []) year = Math.min(year, due(d.code, depth + 1) - (d.concurrent ? 0 : 1))
      }
      year = Math.max(1, year)
      dueMemo.set(code, year)
      return year
    }

    const courses: PlannedCourse[] = named.map((course) => ({
      ...course,
      cu: cuOf(course.code),
      year: program?.yearOf(course.code) ?? due(course.code),
      ...(course.group ? {} : program?.groupOf(course.code) ? { group: program.groupOf(course.code) } : {}),
    }))
    const model: ModelCourse[] = named.map((course, i) => ({
      id: course.code,
      named: true,
      cu: cuOf(course.code),
      level: levelOf(course.code),
      seniorCmpt: subjectOf(course.code) === 'CMPT' && levelOf(course.code) >= 3,
      year: courses[i].year ?? due(course.code),
      group: i,
      loose: false,
    }))

    // Free electives are due round-robin from Year 2 (Year 1 is the advising sheet's) to the year
    // before the last, and take turns with the degree's own open slots.
    const plannedCu = model.reduce((n, i) => n + i.cu, 0) + slots.length * 3
    const firstYear = Math.floor(gateCu / 30) + 1
    const lastYear = Math.max(firstYear, Math.floor((gateCu + plannedCu - 1) / 30) + 1)
    const freeYears: number[] = []
    const fromYear = Math.max(firstYear, Math.min(2, lastYear))
    for (let y = fromYear; y <= Math.max(fromYear, lastYear - 1); y++) freeYears.push(y)
    let freeIndex = 0
    let slotIndex = 0
    const isLoose = (label: string) => [FREE_ELECTIVE, SENIOR_ELECTIVE].includes(label) || /^breadth/i.test(label)
    slots.forEach((slot, i) => {
      const year = slot.free ? freeYears[freeIndex % freeYears.length] : (slot.year ?? firstYear)
      const turn = slot.free ? 2 * freeIndex++ + 1 : 2 * slotIndex++
      const course = elective(i, slot.label, year)
      courses.push(course)
      model.push({
        id: course.code,
        named: false,
        cu: 3,
        level: slot.level,
        seniorCmpt: slot.seniorCmpt,
        year,
        group: named.length + turn,
        loose: isLoose(slot.label),
        free: slot.free,
        // No 300- or 400-level CMPT course ran in a Spring/Summer term in 2025-27 (USask's class search).
        summerOk: !/410 or higher|senior cmpt/i.test(slot.label),
      })
    })

    const built = buildModel({
      courses: model,
      catalog,
      start,
      load: perTerm,
      summer: perSummer,
      away,
      passed,
      credited: (code) => barred(code, passed),
      booked,
      blocked,
      honours,
      maxCu,
      maxSeniorCmpt,
      ignoreMissing: !includePrerequisites,
      namedCreditOnly: true,
      ...(degree ? {} : { assumedCuPerTerm: 3 * perTerm }),
      ...(nodeBudget !== undefined ? { nodeBudget } : {}),
      cuOf,
      levelOf,
    })
    if (beat < Number.POSITIVE_INFINITY && coreLowerBound(built.core) >= beat) return null
    // A swap must still finish the degree (the credit-unit audit, junior caps included).
    if (force.size > 0 && (courses.length !== baseCount || built.dropped.length > baseDropped)) return null
    if (degree && force.size > 0) {
      const audit = auditDegree(degree, [...completed, ...courses.map((c) => c.code)])
      if (audit.remainingCu > 0 || audit.remainingSeniorCu > 0) return null
    }
    // An alternative selection gets a small search: it only matters if its lists already beat S0.
    const result = scheduleCore(force.size > 0 ? { ...built.core, nodeBudget: Math.min(built.core.nodeBudget ?? 3000, 300) } : built.core)
    const byCode = new Map(courses.map((c) => [c.code, c]))
    const diagnostics = [...built.diagnostics]
    const placed = new Map<number, PlannedCourse[]>()
    if (result.at) {
      built.core.items.forEach((item, i) => {
        const t = result.at![i]
        const course = byCode.get(item.id)!
        placed.set(t, [...(placed.get(t) ?? []), item.fullYear ? { ...course, fullYear: true } : course])
      })
    } else if (built.core.items.length > 0) {
      for (const item of built.core.items) diagnostics.push({ level: 'error', code: 'HORIZON', course: item.id, message: `${isElective(item.id) ? electiveLabel(item.id) : spaced(item.id)} can't be scheduled within ${built.labels.length} terms.` })
    }
    const terms: PlannedTerm[] = [...placed.keys()].sort((a, b) => a - b).map((t) => ({ label: built.labels[t], courses: placed.get(t)! }))

    // Graduation: the last term holding a planned or booked course.
    const bookedLast = Object.entries(booked).filter(([, v]) => v.length > 0).map(([l]) => termFromLabel(l)).filter((t): t is TermStart => t !== null).sort((a, b) => termOrder(a) - termOrder(b)).at(-1)
    // A full-year course in the last Fall runs on into the Winter after it.
    const plannedLast = result.at && result.graduation >= 0 && built.labels[result.graduation] ? termFromLabel(built.labels[result.graduation]) : null
    const last = [bookedLast, plannedLast].filter((t): t is TermStart => Boolean(t)).sort((a, b) => termOrder(a) - termOrder(b)).at(-1)
    const graduation = last ? `${last.season} ${last.year}` : null

    // An unused seat before the last term, and why.
    if (result.at && terms.length > 0) {
      const G = result.graduation
      for (let t = 0; t < G; t++) {
        const term = built.core.terms[t]
        const used = placed.get(t)?.length ?? 0
        if (term.cap > used && term.season !== 'Spring/Summer') {
          diagnostics.push({ level: 'info', code: 'EMPTY_SEAT', term: term.label, message: `${term.label} has ${term.cap - used} open seat${term.cap - used > 1 ? 's' : ''}: nothing left can be taken yet then.` })
        }
      }
    }

    let bindingKind: BindingKind = result.binding.kind
    let binding = ''
    if (bookedLast && plannedLast && termOrder(bookedLast) > termOrder(plannedLast)) {
      bindingKind = 'booked'
      binding = `Graduation set by your registration in ${graduation}`
    } else if (result.at && terms.length > 0) binding = bindingText(result.binding, perTerm, built.core.items.length)
    const out: Attempt<PlanRun> = {
      g: result.at ? result.graduation : Number.POSITIVE_INFINITY,
      lb: result.lowerBound,
      signature,
      binding: result.binding.chain ?? [],
      choices,
      value: { terms, graduation, optimality: result.optimality === 'proven' ? 'proven' : 'best-found', binding, bindingKind, diagnostics },
    }
    cache.set(signature, out)
    if (force.size === 0) {
      baseCount = courses.length
      baseDropped = built.dropped.length
    }
    return out
  }
  // Alternatives that compete: a published section, in a subject the programs ask for by name.
  const programSubjects = new Set<string>()
  for (const spec of [...allSpecializations, ...targets.map((t) => t.spec)]) {
    for (const group of spec.requirements) if (!group.label && group.courses.length > 0) programSubjects.add(subjectOf(group.prefer?.[0] ?? group.courses[0]))
  }
  // Like for like: same credit units and level as the pick it replaces, so the degree's own slots don't shift.
  const allow = (code: string, instead: string) =>
    catalog[code]?.confidence === 'published' && programSubjects.has(subjectOf(code)) && !barred(code, completed) && cuOf(code) === cuOf(instead) && levelOf(code) === levelOf(instead)
  const { best, proven } = jointSelect(attempt, allow)
  return { ...best.value, optimality: best.value.optimality === 'proven' && proven ? 'proven' : 'best-found' }
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
  return buildStudentPlanResult(targets, allSpecializations, completed, inProgress, coursesPerTerm, start, options).terms
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

/** The term before `t` (the one being sat when a student plans from `t`). */
function previousTerm({ season, year }: TermStart): TermStart {
  return season === 'Winter' ? { season: 'Fall', year: year - 1 } : season === 'Fall' ? { season: 'Winter', year } : { season: 'Winter', year }
}

/**
 * The plan with its explanation (graduation, optimality, binding constraint, diagnostics).
 *
 * Overrides (failed / withdrew / not-offered / later) are applied first (src/lib/overrides.ts);
 * in-progress courses are assumed finished by `start` (or by the end of their own term, when
 * `booked` says which): never planned again, and they unlock their dependants. Targets are
 * re-matched against that, so a slot an in-progress course already fills drops out, and a target it
 * finishes outright yields no terms.
 */
export function buildStudentPlanResult(
  targets: Specialization[],
  allSpecializations: Specialization[],
  completed: Set<string>,
  inProgress: Iterable<string>,
  coursesPerTerm: number,
  start: TermStart,
  options: PlanOptions = {},
): PlanResult {
  const catalog = options.catalog ?? defaultCatalog()
  const current = options.currentTerm ?? previousTerm(start)
  const applied = applyOverrides(
    { completed, inProgress: [...inProgress], booked: options.booked ?? {} },
    options.overrides ?? [],
    catalog,
    `${current.season} ${current.year}`,
  )
  const { degree } = options
  const done = new Set([...applied.completed, ...applied.inProgress])
  // With the degree mapped, the plan is the whole degree: the targets and the degree's own slots
  // together, so every pick has to fit the degree too, and its open slots become unnamed electives.
  const whole = degree ? degreeTarget(degree) : null
  const open = computeMatches(whole ? [...targets, whole] : targets, done).filter((m) => m.remaining > 0)
  if (!degree && open.length === 0) {
    return { terms: [], graduation: null, optimality: 'proven', binding: '', bindingKind: 'none', diagnostics: [...applied.notes] }
  }
  const run = runPlan(open, whole ? [...allSpecializations, whole] : allSpecializations, done, coursesPerTerm, start, {
    ...options,
    catalog,
    booked: applied.booked,
    blocked: applied.blocked,
  })
  return { ...run, diagnostics: [...applied.notes, ...run.diagnostics] }
}
