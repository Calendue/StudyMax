// The planner's entry points beside buildStudentPlan/buildStudentPlanResult (src/lib/plan.ts):
// the exact plan with its explanation, and a replan that says what changed.
import { buildStudentPlanResult, type PlannedTerm, type PlanResult } from '../plan.js'
import { diffPlans } from './explain.js'
import type { PlanDiff } from './types.js'

export { scheduleCore, coreLowerBound } from './schedule.js'
export { buildModel } from './model.js'
export { diffPlans, overrideText, bindingText } from './explain.js'
export { jointSelect, forcedRanker } from './select.js'

/** The plan with its graduation term, optimality, binding constraint and diagnostics. */
export function planExact(...args: Parameters<typeof buildStudentPlanResult>): PlanResult {
  return buildStudentPlanResult(...args)
}

/** Plans again (after overrides changed, say) and lists what moved against the previous plan. */
export function replan(prev: PlannedTerm[], ...args: Parameters<typeof buildStudentPlanResult>): { result: PlanResult; diff: PlanDiff } {
  const result = buildStudentPlanResult(...args)
  return { result, diff: diffPlans(prev, result.terms, args[6]?.overrides ?? [], args[6]?.catalog) }
}
