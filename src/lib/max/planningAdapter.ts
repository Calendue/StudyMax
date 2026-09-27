// Wraps the existing deterministic planner (src/lib/plan.ts, src/lib/match.ts) to produce the
// shapes run_scenario/commit_scenario need, instead of building spec 04's requirement-tree DSL and
// bipartite audit engine from scratch — a deliberate scope substitution for the hackathon weekend
// (docs/BayMax/implementation/03-planning-and-audit-adapter.md; docs/BayMax/spec/05-planning-engine.md).
//
// PREREQ_UNMET and OVER_LOAD can't occur by construction (buildPlan never places a course before an
// unmet prerequisite, and never exceeds coursesPerTerm), and the current catalogue has no offering
// calendar or exclusion data to check NOT_OFFERED/EXCLUSION_CONFLICT/PROGRAM_RESTRICTED against — so
// `validate` below is intentionally close to a no-op.
import { programs } from '../../data/programs/index.js'
import { buildStudentPlan, type PlannedTerm, type TermStart } from '../plan.js'

/** "computer-science" -> "Computer Science", for anything Max says out loud — never speak a raw
 * Program.id slug. Falls back to the id itself if it's somehow unknown, rather than throwing. */
export function programName(programId: string): string {
  return programs.find((p) => p.id === programId)?.name ?? programId
}

/** Same, for a Specialization.id within a given program. */
export function specializationName(programId: string, specializationId: string): string {
  const program = programs.find((p) => p.id === programId)
  return program?.specializations.find((s) => s.id === specializationId)?.name ?? specializationId
}

export interface AdapterInput {
  completed: Set<string>
  /** From StudentCourse where status = "in_progress", minus any DROP_COURSE ops. */
  inProgress: Set<string>
  /** StudentProfile.majorProgramId, e.g. "computer-science". */
  targetProgramId: string
  targetSpecializationIds: string[]
  /** A ceiling, not an exact fill (spec 03 decision 5) — passed straight to buildPlan's perTerm cap. */
  coursesPerTerm: number
  start: TermStart
}

export type ValidationSeverity = 'WARNING' | 'ERROR'

export interface ValidationIssue {
  code: string
  severity: ValidationSeverity
  message: string
}

export interface ValidationResult {
  ok: boolean
  issues: ValidationIssue[]
}

export interface MovedCourse {
  code: string
  from: string
  to: string
}

export interface RoadmapDiff {
  graduation: { before: string | null; after: string | null; changed: boolean }
  added: string[]
  removed: string[]
  moved: MovedCourse[]
  /** 1-3 short strings, graduation first — exactly what Max speaks (spec 07's run_scenario). */
  headline: string[]
}

/**
 * Translates AdapterInput into what buildStudentPlan expects and runs it — no planning logic of
 * its own. Throws if targetProgramId doesn't match a known program; returns an empty plan if none
 * of targetSpecializationIds resolve (matches buildStudentPlan's own "no targets = no plan" rule).
 */
export function regenerate(input: AdapterInput): { terms: PlannedTerm[] } {
  const program = programs.find((p) => p.id === input.targetProgramId)
  if (!program) {
    throw new Error(`planningAdapter.regenerate: unknown targetProgramId "${input.targetProgramId}"`)
  }
  const targets = program.specializations.filter((s) => input.targetSpecializationIds.includes(s.id))
  const terms =
    targets.length === 0
      ? []
      : buildStudentPlan(targets, program.specializations, input.completed, input.inProgress, input.coursesPerTerm, input.start)
  return { terms }
}

/**
 * v1: always ok with no issues. The planner's construction already rules out every ERROR code this
 * catalogue could produce, so there is nothing left for this adapter to detect this weekend.
 */
export function validate(_terms: PlannedTerm[]): ValidationResult {
  return { ok: true, issues: [] }
}

/** Every course code in a plan, mapped to the label of the term it's planned in. */
function courseTermMap(terms: PlannedTerm[]): Map<string, string> {
  return new Map(terms.flatMap((term) => term.courses.map((c) => [c.code, term.label] as const)))
}

/**
 * Compares two PlannedTerm[] snapshots by course code + term label. Templated headline strings,
 * not an LLM call (spec 05's RoadmapDiff.headline).
 */
export function diff(before: PlannedTerm[], after: PlannedTerm[]): RoadmapDiff {
  const beforeLabel = before.length > 0 ? before[before.length - 1].label : null
  const afterLabel = after.length > 0 ? after[after.length - 1].label : null
  const changed = beforeLabel !== afterLabel

  const beforeMap = courseTermMap(before)
  const afterMap = courseTermMap(after)

  const added = [...afterMap.keys()].filter((code) => !beforeMap.has(code))
  const removed = [...beforeMap.keys()].filter((code) => !afterMap.has(code))
  const moved: MovedCourse[] = [...beforeMap.entries()]
    .filter(([code, label]) => afterMap.has(code) && afterMap.get(code) !== label)
    .map(([code, from]) => ({ code, from, to: afterMap.get(code)! }))

  const headline: string[] = []
  if (changed) {
    headline.push(
      beforeLabel && afterLabel
        ? `Graduation moves from ${beforeLabel} to ${afterLabel}.`
        : afterLabel
          ? `Graduation is now projected for ${afterLabel}.`
          : `This plan no longer has a projected graduation term.`,
    )
  }
  if (moved.length > 0) {
    headline.push(`${moved.length} course${moved.length === 1 ? '' : 's'} shift to a later term.`)
  }
  if (removed.length > 0) {
    headline.push(`${removed.length} course${removed.length === 1 ? '' : 's'} no longer needed.`)
  }

  return { graduation: { before: beforeLabel, after: afterLabel, changed }, added, removed, moved, headline: headline.slice(0, 3) }
}
