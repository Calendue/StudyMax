import type { Specialization } from '../data/specializations.ts'
import type { Degree } from '../data/programs/types.ts'
import { courseInfo } from '../data/prereqs.ts'
import { computeCourseOverlap, computeMatches, type SpecializationMatch } from './match.ts'

export interface PlannedCourse {
  code: string
  /**
   * `requirement` — the specialization asks for it directly.
   * `prerequisite` — the specialization doesn't ask for it, but a course that does can't be taken
   * without it. This is the hidden cost of a specialization.
   * `elective` — an open slot the degree needs filled ("Breadth elective", "Free elective"), with no
   * particular course: its code is an `elective:` placeholder (see isElective/electiveLabel).
   */
  reason: 'requirement' | 'prerequisite' | 'elective'
  /** Names of OTHER specializations this same course also advances — the double-dip payoff. */
  alsoAdvances: string[]
  /** For prerequisites: the course that needs it, and the catalogue's verbatim rule. */
  neededBy?: string
  prerequisiteText?: string
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

export interface TermStart {
  season: Season
  year: number
}

/** 3 in "CMPT317". Ranks courses when prerequisites leave the order free. */
/** An unnamed elective slot in a plan. It has no prerequisites, no catalogue page and no sections. */
export const isElective = (code: string) => code.startsWith('elective:')
/** "elective:3:Breadth elective" → "Breadth elective". */
export const electiveLabel = (code: string) => code.split(':').slice(2).join(':')
const elective = (n: number, label: string): PlannedCourse => ({
  code: `elective:${n}:${label}`,
  reason: 'elective',
  alsoAdvances: [],
})
export const FREE_ELECTIVE = 'Free elective'

export function courseLevel(code: string): number {
  const digits = code.match(/(\d)/)
  return digits ? Number(digits[1]) : 9
}

/** AND-groups of OR-options from the catalogue, minus anything already completed or unknown. */
function unmetPrerequisites(code: string, satisfied: Set<string>): string[][] {
  return (courseInfo[code]?.requires ?? []).filter(
    (options) => options.length > 0 && !options.some((option) => satisfied.has(option)),
  )
}

/**
 * Picks the concrete courses that close out the unsatisfied requirement slots of one target — or of
 * several planned together, in which case a course shared between them is planned once and counted
 * for each.
 *
 * Where a slot offers a choice ("CMPT260 or CMPT263"), the option that advances the most OTHER
 * specializations wins — that is the whole point: one course, two credentials. Ties break to the
 * lower course level, then alphabetically, so the pick is deterministic.
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
): PlannedCourse[] {
  const targets = Array.isArray(target) ? target : [target]
  const overlap = computeCourseOverlap(allSpecializations, completed)
  const overlapByCourse = new Map(overlap.map((o) => [o.course, o.specs]))

  const otherSpecCount = (code: string, specId: string) =>
    (overlapByCourse.get(code) ?? []).filter((s) => s.id !== specId).length

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
    .flatMap((t) => t.unsatisfied.map((slot) => ({ ...slot, specId: t.spec.id })))
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

    const ranked = slot.options
      .filter((code) => !pickedCodes.has(code))
      .sort(
        (a, b) =>
          otherSpecCount(b, slot.specId) - otherSpecCount(a, slot.specId) ||
          unmetPrerequisites(a, completed).length - unmetPrerequisites(b, completed).length ||
          courseLevel(a) - courseLevel(b) ||
          a.localeCompare(b),
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
      })
    }
  }

  return picked
}

/**
 * Walks the catalogue prerequisite graph and adds every course the student still needs in order to
 * be allowed to register for the ones the specialization actually requires.
 *
 * Where a prerequisite offers alternatives, the cheapest one wins: already planned, else the option
 * with the fewest unmet prerequisites of its own, else the lowest level.
 */
export function withPrerequisites(picked: PlannedCourse[], completed: Set<string>): PlannedCourse[] {
  const result = [...picked]
  const satisfied = new Set([...completed, ...picked.map((p) => p.code)])
  const queue = picked.map((p) => p.code)
  const seen = new Set(queue)

  while (queue.length > 0) {
    const code = queue.shift()!
    for (const options of unmetPrerequisites(code, satisfied)) {
      const choice = [...options].sort(
        (a, b) =>
          unmetPrerequisites(a, satisfied).length - unmetPrerequisites(b, satisfied).length ||
          courseLevel(a) - courseLevel(b) ||
          a.localeCompare(b),
      )[0]
      if (seen.has(choice)) continue

      seen.add(choice)
      satisfied.add(choice)
      result.push({
        code: choice,
        reason: 'prerequisite',
        alsoAdvances: [],
        neededBy: code,
        prerequisiteText: courseInfo[code]?.prerequisiteText,
      })
      queue.push(choice)
    }
  }

  return result
}

/**
 * Orders courses so nothing is scheduled before its prerequisites. Ties break to the lower course
 * level then alphabetically, so the result is deterministic. A course whose prerequisites can never
 * be met from within this set (a cycle, or a rule the parser couldn't read) is emitted last rather
 * than dropped — the student still needs to see it.
 */
function topologicalOrder(courses: PlannedCourse[], completed: Set<string>): PlannedCourse[] {
  const remaining = new Map(courses.map((c) => [c.code, c]))
  const satisfied = new Set(completed)
  const ordered: PlannedCourse[] = []

  while (remaining.size > 0) {
    const ready = [...remaining.values()]
      .filter((c) => unmetPrerequisites(c.code, satisfied).length === 0)
      .sort((a, b) => courseLevel(a.code) - courseLevel(b.code) || a.code.localeCompare(b.code))

    // Nothing is unblocked: the rest is unreadable or circular. Emit it in a stable order and stop.
    const batch =
      ready.length > 0
        ? ready
        : [...remaining.values()].sort(
            (a, b) => courseLevel(a.code) - courseLevel(b.code) || a.code.localeCompare(b.code),
          )

    for (const course of batch) {
      ordered.push(course)
      remaining.delete(course.code)
      satisfied.add(course.code)
    }
    if (ready.length === 0) break
  }

  return ordered
}

export function nextTerm({ season, year }: TermStart, springSummer = false): TermStart {
  // USask runs Fall (Sept, year Y) then Winter (Jan, year Y+1), with an optional Spring/Summer
  // (May, year Y+1) between Winter and the next Fall.
  if (season === 'Fall') return { season: 'Winter', year: year + 1 }
  if (season === 'Winter' && springSummer) return { season: 'Spring/Summer', year }
  return { season: 'Fall', year }
}

/**
 * Spreads the courses across terms, `coursesPerTerm` at a time (`summerPerTerm` in a Spring/Summer
 * term), never scheduling a course in the same term as (or before) one of its prerequisites.
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
  }: { includePrerequisites?: boolean; springSummer?: boolean; summerPerTerm?: number; degree?: Degree } = {},
): PlannedTerm[] {
  const perTerm = Math.max(1, Math.floor(coursesPerTerm))
  const perSummer = Math.max(1, Math.floor(summerPerTerm))
  const picked = selectCourses(target, allSpecializations, completed, degree?.id)
  const slots = picked.filter((c) => isElective(c.code))
  const real = picked.filter((c) => !isElective(c.code))
  const withPrereqs = includePrerequisites ? withPrerequisites(real, completed) : real
  // With a degree, its open slots are counted after the prerequisites are in: a prerequisite can
  // fill one itself (BIOL 120 for BINF 451 is also a science course).
  const open = degree ? openSlots(degree, completed, withPrereqs) : slots
  const ordered = topologicalOrder(withPrereqs, completed)
  let electives = [...open, ...freeElectives(degree, completed, withPrereqs, open.length)]

  const terms: PlannedTerm[] = []
  const satisfied = new Set(completed)
  let pending = [...ordered]
  let term = start

  while (pending.length > 0 || electives.length > 0) {
    const thisTerm: PlannedCourse[] = []
    const limit = term.season === 'Spring/Summer' ? perSummer : perTerm
    const fill = (cap: number) => {
      for (const course of pending) {
        if (thisTerm.length >= cap) break
        // A prerequisite taken this same term doesn't count — it has to be finished first.
        if (thisTerm.includes(course) || unmetPrerequisites(course.code, satisfied).length > 0) continue
        thisTerm.push(course)
      }
    }
    // Named courses first, in prerequisite order: they hold the chains that set how long the degree
    // takes. Electives fill the seats left, which a prerequisite chain leaves in most terms.
    fill(limit)
    while (thisTerm.length < limit && electives.length > 0) thisTerm.push(electives.shift()!)

    // Everything left is blocked by something not in the plan: place it rather than loop forever.
    const batch = thisTerm.length > 0 ? thisTerm : pending.slice(0, limit)

    terms.push({ label: `${term.season} ${term.year}`, courses: batch })
    for (const course of batch) satisfied.add(course.code)
    pending = pending.filter((c) => !batch.includes(c))
    term = nextTerm(term, springSummer)
  }

  return terms
}

/**
 * Free electives: the degree's course total, less its named slots, less every course taken or planned
 * that no slot uses (a specialization course the degree doesn't list, a prerequisite, an outside
 * course on the transcript). Those already fill elective room.
 */
function freeElectives(degree: Degree | undefined, completed: Set<string>, planned: PlannedCourse[], offset: number) {
  if (!degree) return []
  const taken = new Set([...completed, ...planned.map((c) => c.code)])
  const slots = degree.requirements.reduce((n, g) => n + g.need, 0)
  const unused = taken.size - computeMatches([degree], taken)[0].doneCount
  const count = Math.max(0, degree.totalCourses - slots - unused)
  return Array.from({ length: count }, (_, i) => elective(offset + i, FREE_ELECTIVE))
}

/** The degree's open-choice slots still unfilled once the planned courses are counted. */
function openSlots(degree: Degree, completed: Set<string>, planned: PlannedCourse[]): PlannedCourse[] {
  const taken = new Set([...completed, ...planned.map((c) => c.code)])
  const out: PlannedCourse[] = []
  for (const slot of computeMatches([degree], taken)[0].unsatisfied) {
    if (slot.label) for (let i = 0; i < slot.need; i++) out.push(elective(out.length, slot.label))
  }
  return out
}

/**
 * The plan from the student's own state, starting in the term they chose.
 *
 * In-progress courses are assumed finished by `start`: never planned again, and they unlock their
 * dependants from the first planned term. Targets are re-matched against that, so a slot an
 * in-progress course already fills drops out — and a target it finishes outright yields no terms.
 */
export function buildStudentPlan(
  targets: Specialization[],
  allSpecializations: Specialization[],
  completed: Set<string>,
  inProgress: Iterable<string>,
  coursesPerTerm: number,
  start: TermStart,
  springSummer = false,
  summerPerTerm = DEFAULT_SUMMER_COURSES,
  degree?: Degree,
): PlannedTerm[] {
  const done = new Set([...completed, ...inProgress])
  // With the degree mapped, the plan is the whole degree: the targets and the degree's own slots
  // together, so every pick has to fit the degree too, and its open slots become unnamed electives.
  const open = computeMatches(degree ? [...targets, degree] : targets, done).filter((m) => m.remaining > 0)
  if (!degree && open.length === 0) return []
  return buildPlan(open, degree ? [...allSpecializations, degree] : allSpecializations, done, coursesPerTerm, start, {
    springSummer,
    summerPerTerm,
    degree,
  })
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
