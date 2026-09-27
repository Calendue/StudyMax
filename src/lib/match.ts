import type { RequirementGroup, Specialization } from '../data/specializations.js'
import type { Degree } from '../data/degrees/types.js'

export interface UnsatisfiedGroup {
  /** Courses in this slot the student hasn't completed yet (any one/N of them would count). */
  options: string[]
  need: number
  /** The slot's open-choice label, when it has one: planned as an unnamed elective. */
  label?: string
}

export interface SpecializationMatch {
  spec: Specialization
  totalRequired: number
  doneCount: number
  remaining: number
  unsatisfied: UnsatisfiedGroup[]
}

function matchOne(spec: Specialization, completed: Set<string>): SpecializationMatch {
  // A course counts once: where two slots list the same course (a writing course that's also on the
  // breadth list), it goes to one of them. The slot with the fewest options claims first, so a course
  // isn't used up by a broad slot that had other ways to be filled.
  const used = new Set<string>()
  const filled = new Map<RequirementGroup, number>()
  for (const group of [...spec.requirements].sort((a, b) => a.courses.length - b.courses.length)) {
    const mine = group.courses.filter((c) => completed.has(c) && !used.has(c)).slice(0, group.need)
    for (const c of mine) used.add(c)
    filled.set(group, mine.length)
  }

  let totalRequired = 0
  let doneCount = 0
  const unsatisfied: UnsatisfiedGroup[] = []
  for (const group of spec.requirements) {
    totalRequired += group.need
    const satisfied = filled.get(group) ?? 0
    doneCount += satisfied
    if (satisfied < group.need) {
      unsatisfied.push({
        options: group.courses.filter((c) => !completed.has(c)),
        need: group.need - satisfied,
        ...(group.label ? { label: group.label } : {}),
      })
    }
  }

  return { spec, totalRequired, doneCount, remaining: totalRequired - doneCount, unsatisfied }
}

/**
 * The open slots minus what the student is already registered for: a registered course fills its
 * slot (the plan counts it as passed by then), so "What's left" never lists it. The counts stay
 * the match's own; this only splits the list for display and for picking the next course.
 */
export function withoutRegistered(
  unsatisfied: UnsatisfiedGroup[],
  inProgress: Iterable<string>,
): { left: UnsatisfiedGroup[]; registered: string[] } {
  const taking = new Set(inProgress)
  const used = new Set<string>()
  const left: UnsatisfiedGroup[] = []
  for (const group of unsatisfied) {
    const mine = group.options.filter((c) => taking.has(c) && !used.has(c)).slice(0, group.need)
    mine.forEach((c) => used.add(c))
    const need = group.need - mine.length
    if (need > 0) left.push({ ...group, need, options: group.options.filter((c) => !taking.has(c)) })
  }
  return { left, registered: [...used] }
}

/**
 * The order targets are offered in: one that can be finished from the current catalogue before one
 * that can't (`unavailable`), then fewest remaining courses, then the most courses the degree itself
 * names (a first-year is equally far from several; the one that shares most with the degree wins),
 * then name.
 */
export function compareMatches(degree?: Degree): (a: SpecializationMatch, b: SpecializationMatch) => number {
  // The degree's named courses: its open-choice lists are electives, not what it names.
  const named = new Set(degree?.groups.filter((g) => !g.open).flatMap((g) => g.courses) ?? [])
  const shared = (m: SpecializationMatch) => new Set(m.spec.requirements.flatMap((g) => g.courses).filter((c) => named.has(c))).size
  return (a, b) =>
    Number(Boolean(a.spec.unavailable)) - Number(Boolean(b.spec.unavailable)) ||
    a.remaining - b.remaining ||
    shared(b) - shared(a) ||
    a.spec.name.localeCompare(b.spec.name)
}

/** Ranks all specializations by fewest remaining courses first (see compareMatches). */
export function computeMatches(
  specializations: Specialization[],
  completed: Set<string>,
  /** The program's degree, where it's mapped: breaks ties toward what it names. */
  degree?: Degree,
): SpecializationMatch[] {
  return specializations.map((spec) => matchOne(spec, completed)).sort(compareMatches(degree))
}

export interface CourseOverlap {
  course: string
  /** Specializations this course would advance — only counts an unsatisfied requirement slot. */
  specs: Specialization[]
}

/**
 * For every not-yet-completed course, counts how many specializations it would advance
 * (i.e. it sits in a requirement group that isn't already satisfied another way).
 * Ranked highest-overlap first.
 */
export function computeCourseOverlap(specializations: Specialization[], completed: Set<string>): CourseOverlap[] {
  const bySpec = new Map<string, Set<Specialization>>()

  for (const spec of specializations) {
    for (const group of spec.requirements) {
      const satisfied = Math.min(group.need, group.courses.filter((c) => completed.has(c)).length)
      if (satisfied >= group.need) continue
      for (const course of group.courses) {
        if (completed.has(course)) continue
        if (!bySpec.has(course)) bySpec.set(course, new Set())
        bySpec.get(course)!.add(spec)
      }
    }
  }

  return [...bySpec.entries()]
    .map(([course, specs]) => ({
      course,
      specs: [...specs].sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => b.specs.length - a.specs.length || a.course.localeCompare(b.course))
}
