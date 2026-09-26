import type { RequirementGroup } from '../specializations.ts'
import { catalogueCourses } from '../courses.ts'

export const single = (course: string): RequirementGroup => ({ courses: [course], need: 1 })

/**
 * Every catalogue course in `subject` at the given levels ("BIOL — 200-Level, 300-Level, 400-Level"
 * on a program page), minus `exclude`. Built from the scraped catalogue so it can't drift from it.
 *
 * Pass every code the same specialization names elsewhere as `exclude`: the matcher counts each
 * requirement group independently, so an overlapping bucket would count one course twice.
 */
export function subjectAtLevels(subject: string, levels: number[], exclude: string[] = []): string[] {
  const skip = new Set(exclude)
  const pattern = new RegExp(`^${subject}(\\d)\\d\\d$`)
  return catalogueCourses
    .map((c) => c.code)
    .filter((code) => {
      const level = code.match(pattern)?.[1]
      return level !== undefined && levels.includes(Number(level) * 100) && !skip.has(code)
    })
}

/** Every course code a list of groups names, for building an `exclude` list. */
export const codesIn = (groups: RequirementGroup[]): string[] => groups.flatMap((g) => g.courses)
