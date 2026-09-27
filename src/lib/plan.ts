import type { Specialization } from '../data/specializations.ts'
import { courseInfo } from '../data/prereqs.ts'
import { offerings as scrapedOfferings } from '../data/offerings.ts'
import { computeCourseOverlap, computeMatches, type SpecializationMatch } from './match.ts'

export interface PlannedCourse {
  code: string
  /**
   * `requirement` — the specialization asks for it directly.
   * `prerequisite` — the specialization doesn't ask for it, but a course that does can't be taken
   * without it. This is the hidden cost of a specialization.
   * `registered` — already being taken; placed in its term for display, never scheduled by the plan.
   */
  reason: 'requirement' | 'prerequisite' | 'registered'
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

// A Spring/Summer term is short (May to August, compressed sessions), so it carries a light load.
const SPRING_SUMMER_COURSES = 2

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

export function nextTerm({ season, year }: TermStart, springSummer = false): TermStart {
  // USask runs Fall (Sept, year Y) then Winter (Jan, year Y+1), with an optional Spring/Summer
  // (May, year Y+1) between Winter and the next Fall.
  if (season === 'Fall') return { season: 'Winter', year: year + 1 }
  if (season === 'Winter' && springSummer) return { season: 'Spring/Summer', year }
  return { season: 'Fall', year }
}

/** Terms in calendar order: Winter, then Spring/Summer, then Fall, within a year. */
function termOrder({ season, year }: TermStart): number {
  return year * 10 + (season === 'Winter' ? 0 : season === 'Spring/Summer' ? 1 : 2)
}

function termFromLabel(label: string): TermStart | null {
  const match = label.match(/^(Fall|Winter|Spring\/Summer) (\d{4})$/)
  return match ? { season: match[1] as Season, year: Number(match[2]) } : null
}

/**
 * Spreads the courses across terms, `coursesPerTerm` at a time, never scheduling a course in the
 * same term as (or before) one of its prerequisites.
 *
 * `booked` holds courses the student is already taking, by term label ("Winter 2027"). They take up
 * room in their term, so the plan only adds what's left of `coursesPerTerm` there, and they only
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
    booked = {},
    offerings = scrapedOfferings,
  }: {
    includePrerequisites?: boolean
    springSummer?: boolean
    booked?: Record<string, string[]>
    /** The seasons each course runs in (src/data/offerings.ts); a course with none can go anywhere. */
    offerings?: Record<string, Season[]>
  } = {},
): PlannedTerm[] {
  /**
   * Whether a course runs in a season. A course the offerings don't know, or one that only runs in
   * Spring/Summer when the plan leaves those out, is placed anywhere rather than never.
   */
  const runsIn = (code: string, season: Season) => {
    const seasons = (offerings[code] ?? []).filter((s) => springSummer || s !== 'Spring/Summer')
    return seasons.length === 0 || seasons.includes(season)
  }
  const perTerm = Math.max(1, Math.floor(coursesPerTerm))
  const picked = selectCourses(target, allSpecializations, completed)
  const withPrereqs = includePrerequisites ? withPrerequisites(picked, completed) : picked
  const ordered = topologicalOrder(withPrereqs, completed)

  const bookedTerms = Object.entries(booked).flatMap(([label, codes]) => {
    const t = termFromLabel(label)
    return t ? [{ order: termOrder(t), codes }] : []
  })
  const terms: PlannedTerm[] = []
  // A booked course isn't passed until its term ends, whatever `completed` assumes.
  const bookedCodes = new Set(bookedTerms.flatMap((b) => b.codes))
  const satisfied = new Set([...completed].filter((code) => !bookedCodes.has(code)))
  let pending = [...ordered]
  let term = start

  // Enough terms to place everything even at one course a term around full ones; a safety bound.
  for (let guard = 0; pending.length > 0 && guard < 60; guard++) {
    // Courses booked in earlier terms (including ones this plan skips) are finished by now.
    for (const b of bookedTerms) if (b.order < termOrder(term)) b.codes.forEach((code) => satisfied.add(code))
    const label = `${term.season} ${term.year}`
    const base = term.season === 'Spring/Summer' ? Math.min(perTerm, SPRING_SUMMER_COURSES) : perTerm
    const limit = base - (booked[label]?.length ?? 0)
    if (limit <= 0) {
      // Already full with what the student is taking: nothing to add here.
      term = nextTerm(term, springSummer)
      continue
    }
    const thisTerm: PlannedCourse[] = []
    for (const course of pending) {
      if (thisTerm.length === limit) break
      // Only in a term that actually runs it.
      if (!runsIn(course.code, term.season)) continue
      // A prerequisite taken this same term doesn't count — it has to be finished first.
      if (unmetPrerequisites(course.code, satisfied).length > 0) continue
      thisTerm.push(course)
    }

    // Nothing placed. If some course is only waiting for a term that runs it, move on; if everything
    // left is blocked by something not in the plan, place what runs here rather than loop forever.
    // "Waiting" means a missing prerequisite is still coming: planned, or booked in a later term.
    const coming = new Set([...pending.map((c) => c.code), ...bookedCodes])
    const stuck = pending.every((c) =>
      unmetPrerequisites(c.code, satisfied).some((options) => !options.some((option) => coming.has(option))),
    )
    const batch = thisTerm.length > 0 ? thisTerm : stuck ? pending.filter((c) => runsIn(c.code, term.season)).slice(0, limit) : []

    if (batch.length === 0) {
      term = nextTerm(term, springSummer)
      continue
    }
    terms.push({ label, courses: batch })
    for (const course of batch) satisfied.add(course.code)
    pending = pending.filter((c) => !batch.includes(c))
    term = nextTerm(term, springSummer)
  }

  // Anything the offerings or prerequisites couldn't fit in the window is shown, not dropped.
  if (pending.length > 0) terms.push({ label: `${term.season} ${term.year}`, courses: pending })

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
  springSummer = false,
  booked: Record<string, string[]> = {},
): PlannedTerm[] {
  const done = new Set([...completed, ...inProgress])
  const open = computeMatches(targets, done).filter((m) => m.remaining > 0)
  return open.length > 0 ? buildPlan(open, allSpecializations, done, coursesPerTerm, start, { springSummer, booked }) : []
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
