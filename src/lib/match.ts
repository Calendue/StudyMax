import type { RequirementGroup, Specialization } from '../data/specializations.js'

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

/** Ranks all specializations by fewest remaining courses first. */
export function computeMatches(specializations: Specialization[], completed: Set<string>): SpecializationMatch[] {
  return specializations
    .map((spec) => matchOne(spec, completed))
    .sort((a, b) => a.remaining - b.remaining || a.spec.name.localeCompare(b.spec.name))
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
