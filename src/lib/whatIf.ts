import type { Specialization } from '../data/specializations.ts'
import type { SpecializationMatch } from './match.ts'
import { buildStudentPlan, type TermStart } from './plan.ts'

// "What if I went for X instead?" Plans two targets on their own, with the same inputs the student's
// real plan uses, and says how they differ. Pure: the planner does the work, this only compares.

export interface WhatIfInputs {
  planningSpecs: Specialization[]
  completed: Set<string>
  inProgress: Iterable<string>
  coursesPerTerm: number
  start: TermStart
  springSummer: boolean
  /** In-progress courses by term label, as the real plan uses them. */
  booked?: Record<string, string[]>
}

export interface TargetOutlook {
  match: SpecializationMatch
  /** Terms the plan takes; 0 when in-progress courses finish it outright. */
  terms: number
  /** The last planned term's label, e.g. "Winter 2028". */
  finish: string | null
  /** Courses the specialization itself asks for that are still to take. */
  required: number
  /** Prerequisites it needs that its own page never lists. */
  prerequisites: number
  /** Every planned course code. */
  courses: string[]
}

export interface WhatIf {
  current: TargetOutlook
  other: TargetOutlook
  /** Planned courses that count toward both, so switching wouldn't waste them. */
  shared: string[]
}

export function outlook(match: SpecializationMatch, input: WhatIfInputs): TargetOutlook {
  const plan = buildStudentPlan(
    [match.spec],
    input.planningSpecs,
    input.completed,
    input.inProgress,
    input.coursesPerTerm,
    input.start,
    input.springSummer,
    input.booked,
  )
  const courses = plan.flatMap((t) => t.courses)
  return {
    match,
    terms: plan.length,
    finish: plan[plan.length - 1]?.label ?? null,
    required: courses.filter((c) => c.reason === 'requirement').length,
    prerequisites: courses.filter((c) => c.reason === 'prerequisite').length,
    courses: courses.map((c) => c.code),
  }
}

export function compareTargets(current: SpecializationMatch, other: SpecializationMatch, input: WhatIfInputs): WhatIf {
  const a = outlook(current, input)
  const b = outlook(other, input)
  const inA = new Set(a.courses)
  return { current: a, other: b, shared: b.courses.filter((c) => inA.has(c)) }
}

/** "+1 term", "−2 courses", "same": how the other target compares, from the student's side. */
export function delta(from: number, to: number, unit: string, units = `${unit}s`): string {
  const d = to - from
  if (d === 0) return 'same'
  return `${d > 0 ? '+' : '−'}${Math.abs(d)} ${Math.abs(d) === 1 ? unit : units}`
}
