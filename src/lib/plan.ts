import type { Specialization } from '../data/specializations.ts'
import { courseInfo } from '../data/prereqs.ts'
import { computeCourseOverlap, computeMatches, type SpecializationMatch } from './match.ts'

export interface PlannedCourse {
  code: string
  /**
   * `requirement` — the specialization asks for it directly.
   * `prerequisite` — the specialization doesn't ask for it, but a course that does can't be taken
   * without it. This is the hidden cost of a specialization.
   */
  reason: 'requirement' | 'prerequisite'
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

export type Season = 'Fall' | 'Winter'

export interface TermStart {
  season: Season
  year: number
}

/** 3 in "CMPT317". Ranks courses when prerequisites leave the order free. */
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
          .filter((s) => s.id !== slot.specId)
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

export function nextTerm({ season, year }: TermStart): TermStart {
  // USask runs Fall (Sept, year Y) then Winter (Jan, year Y+1).
  return season === 'Fall' ? { season: 'Winter', year: year + 1 } : { season: 'Fall', year }
}

/**
 * Spreads the courses across terms, `coursesPerTerm` at a time, never scheduling a course in the
 * same term as (or before) one of its prerequisites.
 */
export function buildPlan(
  target: SpecializationMatch | SpecializationMatch[],
  allSpecializations: Specialization[],
  completed: Set<string>,
  coursesPerTerm: number,
  start: TermStart,
  { includePrerequisites = true }: { includePrerequisites?: boolean } = {},
): PlannedTerm[] {
  const perTerm = Math.max(1, Math.floor(coursesPerTerm))
  const picked = selectCourses(target, allSpecializations, completed)
  const withPrereqs = includePrerequisites ? withPrerequisites(picked, completed) : picked
  const ordered = topologicalOrder(withPrereqs, completed)

  const terms: PlannedTerm[] = []
  const satisfied = new Set(completed)
  let pending = [...ordered]
  let term = start

  while (pending.length > 0) {
    const thisTerm: PlannedCourse[] = []
    for (const course of pending) {
      if (thisTerm.length === perTerm) break
      // A prerequisite taken this same term doesn't count — it has to be finished first.
      if (unmetPrerequisites(course.code, satisfied).length > 0) continue
      thisTerm.push(course)
    }

    // Everything left is blocked by something not in the plan: place it rather than loop forever.
    const batch = thisTerm.length > 0 ? thisTerm : pending.slice(0, perTerm)

    terms.push({ label: `${term.season} ${term.year}`, courses: batch })
    for (const course of batch) satisfied.add(course.code)
    pending = pending.filter((c) => !batch.includes(c))
    term = nextTerm(term)
  }

  return terms
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
): PlannedTerm[] {
  const done = new Set([...completed, ...inProgress])
  const open = computeMatches(targets, done).filter((m) => m.remaining > 0)
  return open.length > 0 ? buildPlan(open, allSpecializations, done, coursesPerTerm, start) : []
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
