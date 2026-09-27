// Wraps the existing deterministic planner (src/lib/plan.ts, src/lib/match.ts) to produce the
// shapes run_scenario/commit_scenario need, instead of building spec 04's requirement-tree DSL and
// bipartite audit engine from scratch — a deliberate scope substitution for the hackathon weekend
// (docs/BayMax/implementation/03-planning-and-audit-adapter.md; docs/BayMax/spec/05-planning-engine.md).
//
// regenerate() builds the same plan the app's Plan tab does (src/App.tsx, the buildStudentPlan call):
// the whole degree where the program maps one, the student's targets and the credentials they're
// partway through, at the student's own load preferences. Every server path (Max's scenarios,
// api/session.ts's autosave, the demo seed) goes through it, so a scenario always diffs like with like.
//
// validate() re-checks the planner's hard constraints on its output. The exact planner never relaxes
// a rule (an unplaceable course is left out with a diagnostic), so an ERROR here means a real bug and
// blocks the commit (spec 05); AT_RISK warns about a course with no section in three years.
import { programs } from '../../data/programs/index.js'
import { defaultCatalog } from '../catalog.js'
import type { Program } from '../../data/programs/types.js'
import { computeCredentials } from '../credentials.js'
import { bookedByTerm, seasonNow } from '../currentTerms.js'
import { computeMatches, type SpecializationMatch } from '../match.js'
import {
  buildStudentPlan,
  courseRunsIn,
  electiveLabel,
  isElective,
  nextFall,
  prerequisitesMet,
  termFromLabel,
  termOrder,
  upcomingTerm,
  type PlannedTerm,
  type Season,
  type TermStart,
} from '../plan.js'

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

/** A plan entry as Max says it: a course code, or an open slot's label ("Breadth elective"). */
export function speakableCourse(code: string): string {
  return isElective(code) ? electiveLabel(code) : code
}

export interface AdapterInput {
  completed: Set<string>
  /** From StudentCourse (in_progress + registered), minus any DROP_COURSE ops. */
  inProgress: Set<string>
  /** StudentProfile.majorProgramId, e.g. "computer-science". */
  targetProgramId: string
  /** The concentrations the student picked (StudentProfile.concentrationIds). */
  targetSpecializationIds: string[]
  /** A declared minor: its requirement lists become targets too, as onboarding seeds them. */
  minorProgramId: string | null
  /** StudentProfile.maxCoursesPerTerm — a hard ceiling per Fall/Winter term (spec 03), not an exact fill. */
  coursesPerTerm: number
  /** StudentProfile.springSummer: whether the plan may use Spring/Summer terms. */
  springSummer: boolean
  /** StudentProfile.maxSummerCourses: the ceiling for a Spring/Summer term. */
  summerPerTerm: number
  start: TermStart
  /** "Now", for the term the in-progress courses are booked in. */
  today: Date
  /** Each in-progress course's own season (the app's courseTerms). Missing: the season running now. */
  inProgressSeasons?: Record<string, Season>
  /** The degree variant the student chose (Program.degrees[].variant); missing: the program's default. */
  degreeVariant?: string | null
  /** An academic year left empty for an internship (PlanOptions.away): the app's own on a live call,
   * else StudentProfile.internshipAcademicYear, which the app resolved and saved. */
  away?: number | null
  /** Courses the student put in a term themselves, by term label (PlanOptions.pinned). */
  pinned?: Record<string, string[]>
  /** Courses the student asked for in no particular term (PlanOptions.added). */
  added?: string[]
}

/** Where a plan starts when nobody picked: the next Fall for someone with nothing taken or under way, else the upcoming term (the app's rule). */
export function defaultStart(completed: ReadonlySet<string>, inProgress: ReadonlySet<string>, today: Date): TermStart {
  return completed.size === 0 && inProgress.size === 0 ? nextFall(today) : upcomingTerm(today)
}

export type ValidationSeverity = 'INFO' | 'WARNING' | 'ERROR'

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

/** In-progress courses that aren't also completed (the app's takingNow rule). */
function takingNow(input: AdapterInput): string[] {
  return [...input.inProgress].filter((code) => !input.completed.has(code))
}

/** The in-progress courses, booked in their own season's term — the app's currentByTerm. Without
 * per-course seasons (a saved account; they stay on the device) each goes in the season running now. */
function bookedNow(input: AdapterInput): Record<string, string[]> {
  const courses = takingNow(input)
  const now = seasonNow(input.today)
  const order: Season[] = ['Fall', 'Winter', 'Spring/Summer']
  const from = order.indexOf(now)
  const groups = [...order.slice(from), ...order.slice(0, from)]
    .map((season) => ({ season, courses: courses.filter((c) => (input.inProgressSeasons?.[c] ?? now) === season) }))
    .filter((g) => g.courses.length > 0)
  return bookedByTerm(groups, input.today)
}

/** The program's degree as the student chose it: their variant, else the default. */
function activeDegree(program: Program, variant: string | null | undefined) {
  return program.degrees?.find((d) => d.variant === variant) ?? program.degree
}

export interface TermSchedule {
  term: string
  /** Under way in this term: taking now, or registered for it. */
  takingNow: string[]
  /** What the plan puts in this term (an open slot by its name, e.g. "Free elective"). */
  planned: string[]
  /** Passed in this term, where the record says when. */
  completed: string[]
}

/** Every term with anything in it, in order: what was passed there, what's under way (in its own term), and what the plan puts there. */
export function scheduleByTerm(input: AdapterInput, terms: PlannedTerm[], passed: Record<string, string> = {}): TermSchedule[] {
  const say = (code: string) => (isElective(code) ? electiveLabel(code) : code.replace(/^([A-Z]+)(\d)/, '$1 $2'))
  const byTerm = new Map<string, TermSchedule>()
  const at = (label: string) => {
    if (!byTerm.has(label)) byTerm.set(label, { term: label, takingNow: [], planned: [], completed: [] })
    return byTerm.get(label)!
  }
  for (const [code, label] of Object.entries(passed)) if (input.completed.has(code) && termFromLabel(label)) at(label).completed.push(say(code))
  for (const [label, codes] of Object.entries(bookedNow(input))) at(label).takingNow.push(...codes.map(say))
  for (const t of terms) {
    const entry = at(t.label)
    for (const c of t.courses) {
      const said = say(c.code)
      if (!entry.takingNow.includes(said)) entry.planned.push(said)
    }
  }
  const order = (label: string) => termOrder(termFromLabel(label) ?? { season: 'Fall', year: 9999 })
  return [...byTerm.values()].filter((e) => e.takingNow.length + e.planned.length + e.completed.length > 0).sort((a, b) => order(a.term) - order(b.term))
}

/** What they're taking now, by term label ("Fall 2026": [...], "Winter 2027": [...]), for Max to say term by term. */
export function underWayByTerm(input: AdapterInput): Record<string, string[]> {
  return bookedNow(input)
}

/** "Fall 2026: CMPT 332, CMPT 340; Winter 2027: CMPT 353" — one line Max can read term by term. */
export function termLine(byTerm: Record<string, string[]>): string {
  const spoken = (code: string) => code.replace(/^([A-Z]+)(\d)/, '$1 $2')
  return Object.entries(byTerm)
    .filter(([, codes]) => codes.length > 0)
    .map(([label, codes]) => `${label}: ${codes.map(spoken).join(', ')}`)
    .join('; ')
}

/** A plan as one string ("Winter 2027:CMPT371,CMPT470|…") — equal plans, equal hashes. */
export function planHash(terms: PlannedTerm[]): string {
  return terms.map((t) => `${t.label}:${t.courses.map((c) => c.code).join(',')}`).join('|')
}

/**
 * The student's plan, built exactly as the app builds it. Throws if targetProgramId doesn't match a
 * known program.
 */
export function regenerate(input: AdapterInput): { terms: PlannedTerm[] } {
  const program = programs.find((p) => p.id === input.targetProgramId)
  if (!program) {
    throw new Error(`planningAdapter.regenerate: unknown targetProgramId "${input.targetProgramId}"`)
  }

  const degree = activeDegree(program, input.degreeVariant)
  const matches = computeMatches(program.specializations, input.completed, degree)
  // Certificates and minors: planned by the same engine, and targets when the student declared one.
  const credentials = computeCredentials(programs, input.completed, program.id)
  const planningSpecs = [...program.specializations, ...credentials.map((c) => c.spec)]

  // Onboarding's seed: the concentrations, then the declared minor's requirement lists.
  const minorSpecIds = programs.find((p) => p.id === input.minorProgramId)?.specializations.map((s) => s.id) ?? []
  const seed = [...input.targetSpecializationIds, ...minorSpecIds]
  const hero = matches.find((m) => m.spec.id === seed[0]) ?? credentials.find((c) => c.spec.id === seed[0]) ?? matches[0]
  const byId = new Map<string, SpecializationMatch>([...matches, ...credentials].map((m) => [m.spec.id, m]))
  const extras = seed.slice(1).flatMap((id) => {
    const m = byId.get(id)
    return m ? [m] : []
  })
  const targets = [...(hero ? [hero] : []), ...extras].filter((m) => m.remaining > 0)

  const terms = buildStudentPlan(
    targets.map((t) => t.spec),
    planningSpecs,
    input.completed,
    takingNow(input),
    input.coursesPerTerm,
    input.start,
    {
      springSummer: input.springSummer,
      summerPerTerm: input.summerPerTerm,
      degree,
      booked: bookedNow(input),
      away: input.away ?? null,
      pinned: input.pinned,
      added: input.added,
    },
  )
  return { terms }
}

/**
 * Re-checks a plan against the hard constraints (spec 05's ERROR codes this data can support):
 * OVER_LOAD (a term over the student's own ceiling, courses already under way counted), PREREQ_UNMET,
 * NOT_OFFERED and DUPLICATE_COURSE, using the planner's own offering and prerequisite rules.
 */
export function validate(terms: PlannedTerm[], input: AdapterInput): ValidationResult {
  const issues: ValidationIssue[] = []
  const catalog = defaultCatalog()
  const booked = bookedNow(input)
  const passed = new Set([...input.completed, ...takingNow(input)])
  const seen = new Set<string>()

  if (takingNow(input).length > 0) {
    issues.push({ code: 'ASSUMES_IN_PROGRESS_PASS', severity: 'INFO', message: 'This plan assumes you pass the courses you are taking now.' })
  }

  for (const term of terms) {
    const season = term.label.slice(0, term.label.lastIndexOf(' ')) as Season
    const cap = season === 'Spring/Summer' ? input.summerPerTerm : input.coursesPerTerm
    // Booked courses above the load are the student's own registration (shown, never grown); only
    // planned courses past what's left of the load are an error.
    const room = Math.max(0, cap - (booked[term.label]?.length ?? 0))
    if (term.courses.length > room) {
      issues.push({ code: 'OVER_LOAD', severity: 'ERROR', message: `${term.label} has ${term.courses.length + (booked[term.label]?.length ?? 0)} courses, over your limit of ${cap}.` })
    }

    const real = term.courses.map((c) => c.code).filter((code) => !isElective(code))
    const alongside = new Set(real)
    for (const code of real) {
      if (seen.has(code) || passed.has(code)) {
        issues.push({ code: 'DUPLICATE_COURSE', severity: 'ERROR', message: `${code} appears more than once.` })
      }
      if (!courseRunsIn(code, season, input.springSummer)) {
        issues.push({ code: 'NOT_OFFERED', severity: 'ERROR', message: `${code} isn't offered in ${season}.` })
      }
      if (catalog[code]?.atRisk) {
        issues.push({ code: 'AT_RISK', severity: 'WARNING', message: `${code.replace(/(\d)/, ' $1')} hasn't had a class section in the last three years, so it may not run in ${term.label}.` })
      }
      if (!prerequisitesMet(code, passed, alongside)) {
        issues.push({ code: 'PREREQ_UNMET', severity: 'ERROR', message: `${code} is planned before its prerequisites are done.` })
      }
    }
    for (const code of real) {
      seen.add(code)
      passed.add(code)
    }
  }

  return { ok: !issues.some((i) => i.severity === 'ERROR'), issues }
}

/** Every named course in a plan, mapped to the label of the term it's planned in. Open elective
 * slots are left out: their placeholders are numbered by position, so they'd look added/removed on
 * any change without anything real having moved. */
function courseTermMap(terms: PlannedTerm[]): Map<string, string> {
  return new Map(
    terms.flatMap((term) => term.courses.filter((c) => !isElective(c.code)).map((c) => [c.code, term.label] as const)),
  )
}

/**
 * Compares two PlannedTerm[] snapshots by course code + term label. Templated headline strings,
 * not an LLM call (spec 05's RoadmapDiff.headline).
 */
export function diff(before: PlannedTerm[], after: PlannedTerm[], underWay: ReadonlySet<string> = new Set()): RoadmapDiff {
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

  // Graduation always comes first (spec 05), even unchanged — it's the answer to "what does that do?"
  const headline: string[] = []
  if (changed) {
    headline.push(
      beforeLabel && afterLabel
        ? `Graduation moves from ${beforeLabel} to ${afterLabel}.`
        : afterLabel
          ? `Graduation is now projected for ${afterLabel}.`
          : `This plan no longer has a projected graduation term.`,
    )
  } else if (afterLabel) {
    headline.push(`Graduation stays ${afterLabel}.`)
  }
  if (moved.length > 0) {
    headline.push(moved.length === 1 ? '1 course changes terms.' : `${moved.length} courses change terms.`)
  }
  // A course that left the plan because it's under way again (an undone drop) isn't "no longer needed".
  const backUnderWay = removed.filter((code) => underWay.has(code))
  const unneeded = removed.length - backUnderWay.length
  if (backUnderWay.length > 0) {
    headline.push(`${backUnderWay.join(' and ')} ${backUnderWay.length === 1 ? 'is' : 'are'} back as something you're taking now.`)
  }
  if (unneeded > 0) {
    headline.push(`${unneeded} course${unneeded === 1 ? '' : 's'} no longer needed.`)
  }

  return { graduation: { before: beforeLabel, after: afterLabel, changed }, added, removed, moved, headline: headline.slice(0, 3) }
}
