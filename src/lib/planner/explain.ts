// Diagnostics wording and the replan diff. Pure.
import type { PlannedTerm } from '../plan.js'
import type { CourseOverride } from '../overrides.js'
import type { PlanDiff } from './types.js'

/**
 * What changed between two plans, for the "What changed" list. Elective slots are compared by label
 * per term (their codes renumber), named courses by code. Each entry's cause is traced back to the
 * overrides where it can be.
 * STUB (Stage A contract): the Engine track replaces this body.
 */
export function diffPlans(before: PlannedTerm[], after: PlannedTerm[], overrides: readonly CourseOverride[] = []): PlanDiff {
  void overrides
  const where = (plan: PlannedTerm[]) => new Map(plan.flatMap((t) => t.courses.filter((c) => !c.code.startsWith('elective:')).map((c) => [c.code, t.label] as const)))
  const a = where(before)
  const b = where(after)
  const moved: PlanDiff['moved'] = []
  const added: PlanDiff['added'] = []
  const removed: PlanDiff['removed'] = []
  for (const [code, from] of [...a].sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0))) {
    const to = b.get(code)
    if (to === undefined) removed.push({ course: code, from, cause: '' })
    else if (to !== from) moved.push({ course: code, from, to, cause: '' })
  }
  for (const [code, to] of [...b].sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0))) if (!a.has(code)) added.push({ course: code, to, why: 'requirement', cause: '' })
  const last = (p: PlannedTerm[]) => p.filter((t) => t.courses.length > 0).at(-1)?.label ?? null
  return { moved, added, removed, swapped: [], graduation: { from: last(before), to: last(after), terms: 0 } }
}
