import type { Specialization } from '../data/specializations.ts'
import type { SpecializationMatch } from './match.ts'
import { buildStudentPlan, nextTerm, type TermStart } from './plan.ts'

// "What if I went for X instead?" Plans two targets on their own, with the same inputs the student's
// real plan uses, and says how they differ. Pure: the planner does the work, this only compares.

export interface WhatIfInputs {
  planningSpecs: Specialization[]
  completed: Set<string>
  inProgress: Iterable<string>
  coursesPerTerm: number
  start: TermStart
  springSummer: boolean
  summerPerTerm?: number
  /** In-progress courses by term label, as the real plan uses them. */
  booked?: Record<string, string[]>
  /** The academic year away on an internship, which the real plan leaves empty too. */
  away?: number | null
}

export interface TargetOutlook {
  match: SpecializationMatch
  /** Terms from the start term to the finish, counting any the plan skips waiting for a course to be
   *  offered; 0 when in-progress courses finish it outright. The plan's own length would call a
   *  Winter finish and a Fall one "1 term" alike. */
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
  /** Planned for the other target only: what switching adds. */
  added: string[]
  /** Planned for the current target only: what switching makes unnecessary. */
  dropped: string[]
}

export function outlook(match: SpecializationMatch, input: WhatIfInputs): TargetOutlook {
  const plan = buildStudentPlan(
    [match.spec],
    input.planningSpecs,
    input.completed,
    input.inProgress,
    input.coursesPerTerm,
    input.start,
    // No degree: a what-if weighs one credential against another, and the whole degree would pad
    // both to the same finish.
    { springSummer: input.springSummer, summerPerTerm: input.summerPerTerm, booked: input.booked, away: input.away ?? null },
  )
  const courses = plan.flatMap((t) => t.courses)
  return {
    match,
    terms: termsUntil(input.start, plan[plan.length - 1]?.label ?? null, input.springSummer),
    finish: plan[plan.length - 1]?.label ?? null,
    required: courses.filter((c) => c.reason === 'requirement').length,
    prerequisites: courses.filter((c) => c.reason === 'prerequisite').length,
    courses: courses.map((c) => c.code),
  }
}

function termsUntil(start: TermStart, finish: string | null, springSummer: boolean): number {
  if (!finish) return 0
  let term = start
  for (let n = 1; n <= 60; n++) {
    if (`${term.season} ${term.year}` === finish) return n
    term = nextTerm(term, springSummer)
  }
  return 60
}

export function compareTargets(current: SpecializationMatch, other: SpecializationMatch, input: WhatIfInputs): WhatIf {
  const a = outlook(current, input)
  const b = outlook(other, input)
  const inA = new Set(a.courses)
  const inB = new Set(b.courses)
  return {
    current: a,
    other: b,
    shared: b.courses.filter((c) => inA.has(c)),
    added: b.courses.filter((c) => !inA.has(c)),
    dropped: a.courses.filter((c) => !inB.has(c)),
  }
}

/** Every alternative planned on its own, quickest finish first; a tie goes to fewer courses. */
export function rankAlternatives(choices: SpecializationMatch[], input: WhatIfInputs): TargetOutlook[] {
  return choices
    .map((x) => outlook(x, input))
    .sort((a, b) => a.terms - b.terms || a.courses.length - b.courses.length || a.match.spec.name.localeCompare(b.match.spec.name))
}

/** "1 term sooner", "2 terms later", "same time": the other target's finish against the current one. */
export function termShift(from: number, to: number): string {
  const d = to - from
  if (d === 0) return 'same time'
  return `${Math.abs(d)} ${Math.abs(d) === 1 ? 'term' : 'terms'} ${d < 0 ? 'sooner' : 'later'}`
}

/** "+1 term", "−2 courses", "same": how the other target compares, from the student's side. */
export function delta(from: number, to: number, unit: string, units = `${unit}s`): string {
  const d = to - from
  if (d === 0) return 'same'
  return `${d > 0 ? '+' : '−'}${Math.abs(d)} ${Math.abs(d) === 1 ? unit : units}`
}
