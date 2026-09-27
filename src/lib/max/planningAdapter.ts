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
import { clampLoad, summerLoadOf } from '../planner/loads.js'

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
  /** Fall/Winter courses per term (1-5, clamped) — a ceiling, not an exact fill (spec 03 decision 5). */
  coursesPerTerm: number
  start: TermStart
  /** StudentProfile.internshipAcademicYear: an academic year away on an internship, left empty. */
  away?: number | null
  /** StudentProfile.springSummer: Spring/Summer terms on. Omitted = off. */
  springSummer?: boolean
  /** StudentProfile.maxSummerCourses: courses per Spring/Summer term (0-2; 0 = off, like springSummer false). */
  summerPerTerm?: number
  /** Registered courses fixed in their terms, by term label ("Fall 2026"), counted against that term's load. */
  booked?: Record<string, string[]>
  /**
   * The degree variant ('bsc-4', 'bsc-honours', 'bsc-3'). The app's pick is device-only, so the
   * server omits it and gets the program's default degree (the Four-year for CS), as the app does.
   */
  degreeVariant?: string
}

/**
 * Every input the planner reads for one plan, normalised and sorted so the same student always
 * gives the same JSON: what PlanVersion.inputsHash hashes (api/_planVersion.ts).
 */
export interface PlanInputs {
  program: string
  specializations: string[]
  completed: string[]
  inProgress: string[]
  /** [term label, sorted codes], by term label. */
  booked: [string, string[]][]
  /** Fall/Winter courses per term, 1-5. */
  load: number
  /** Spring/Summer courses per term, 0-2; 0 = no Spring/Summer terms. */
  summer: number
  /** Degree.id ('usask-cmpt-bsc-4'); null for a program with no degree model. */
  degree: string | null
  start: TermStart
  away: number | null
}

const sorted = (codes: Iterable<string>) => [...new Set(codes)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))

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
 * Translates AdapterInput into what buildStudentPlan expects and runs it the way App.tsx does (the
 * program's degree, the chosen loads, booked courses, the internship year) — no planning logic of
 * its own. Returns the plan and its normalised inputs (for PlanVersion.inputsHash). Throws if
 * targetProgramId doesn't match a known program; returns an empty plan if none of
 * targetSpecializationIds resolve (matches buildStudentPlan's own "no targets = no plan" rule).
 */
export function regenerate(input: AdapterInput): { terms: PlannedTerm[]; inputs: PlanInputs } {
  const program = programs.find((p) => p.id === input.targetProgramId)
  if (!program) {
    throw new Error(`planningAdapter.regenerate: unknown targetProgramId "${input.targetProgramId}"`)
  }
  const degree = (input.degreeVariant ? program.degrees?.find((d) => d.variant === input.degreeVariant) : undefined) ?? program.degree
  const inputs: PlanInputs = {
    program: program.id,
    specializations: sorted(input.targetSpecializationIds),
    completed: sorted(input.completed),
    inProgress: sorted(input.inProgress),
    booked: Object.keys(input.booked ?? {})
      .sort()
      .map((label): [string, string[]] => [label, sorted(input.booked![label])])
      .filter(([, codes]) => codes.length > 0),
    load: clampLoad(input.coursesPerTerm),
    summer: summerLoadOf(input.springSummer, input.summerPerTerm),
    degree: degree?.id ?? null,
    start: { season: input.start.season, year: input.start.year },
    away: input.away ?? null,
  }
  const targets = program.specializations.filter((s) => inputs.specializations.includes(s.id))
  const terms =
    targets.length === 0
      ? []
      : buildStudentPlan(targets, program.specializations, new Set(inputs.completed), inputs.inProgress, inputs.load, inputs.start, {
          springSummer: inputs.summer > 0,
          ...(inputs.summer > 0 ? { summerPerTerm: inputs.summer } : {}),
          degree,
          booked: Object.fromEntries(inputs.booked),
          away: inputs.away,
        })
  return { terms, inputs }
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
