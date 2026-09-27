// The planner's case matrix, built the way App.tsx builds a plan (bookedByTerm, the variant's degree,
// the hero target, credentials for double-dip ranking): 3 stages × 12 CS specializations × 3 degree
// variants × Fall/Winter loads 1-5 × Spring/Summer loads 0-2 = 1,620 plans. Shared by
// make-plan-baseline.ts, check-plan-validator.ts and check-plan-properties.ts, so every suite grades
// the same cases. Dates are pinned (TODAY), so the matrix never moves with the clock.
import { computerScience } from '../src/data/programs/computerScience.js'
import { usask } from '../src/data/schools/usask.js'
import { completedCourses as sampleCompleted, inProgressCourses as sampleInProgress, inProgressTerms as sampleTerms } from '../src/data/transcript.js'
import { computeMatches } from '../src/lib/match.js'
import { computeCredentials } from '../src/lib/credentials.js'
import { buildStudentPlan, buildStudentPlanResult, upcomingTerm, type PlanOptions, type PlanResult, type PlannedTerm, type Season, type TermStart } from '../src/lib/plan.js'
import { bookedByTerm, seasonNow } from '../src/lib/currentTerms.js'
import { courseInfo } from '../src/data/prereqs.js'

export const TODAY = new Date(2026, 8, 26)
export const NEXT = upcomingTerm(TODAY)
export const NEXT_FALL: TermStart = { season: 'Fall', year: NEXT.year }
const SEASONS: Season[] = ['Fall', 'Winter', 'Spring/Summer']
const RANK: Record<Season, number> = { Winter: 0, 'Spring/Summer': 1, Fall: 2 }
export const parseTerm = (l: string): TermStart | null => {
  const m = l.match(/^(Fall|Winter|Spring\/Summer) (\d{4})$/)
  return m ? { season: m[1] as Season, year: +m[2] } : null
}
/** Calendar order of a term label: year*10 + (Winter 0, Spring/Summer 1, Fall 2). */
export const termOrd = (l: string) => { const t = parseTerm(l)!; return t.year * 10 + RANK[t.season] }

export const B_COURSES = ['CMPT141', 'MATH110', 'MATH163', 'ENG111', 'BIOL120']
export interface Stage { name: 'first' | 'B' | 'sample'; completed: string[]; inProgress: string[]; terms: Record<string, Season>; start: TermStart }
export const STAGES: Stage[] = [
  { name: 'first', completed: [], inProgress: [], terms: {}, start: NEXT_FALL },
  { name: 'B', completed: [], inProgress: B_COURSES, terms: Object.fromEntries(B_COURSES.map((x) => [x, 'Fall'])) as Record<string, Season>, start: NEXT },
  { name: 'sample', completed: sampleCompleted, inProgress: sampleInProgress, terms: sampleTerms as Record<string, Season>, start: NEXT },
]
export const SPECS = computerScience.specializations
export const VARIANTS = ['bsc-4', 'bsc-honours', 'bsc-3'] as const
export const LOADS = [1, 2, 3, 4, 5]
export const SUMMERS = [0, 1, 2]

export interface MatrixCase { stage: Stage; specId: string; variant: (typeof VARIANTS)[number]; load: number; summer: number; key: string }
export function matrixCases(): MatrixCase[] {
  const out: MatrixCase[] = []
  for (const stage of STAGES) for (const sp of SPECS) for (const variant of VARIANTS) for (const load of LOADS) for (const summer of SUMMERS)
    out.push({ stage, specId: sp.id, variant, load, summer, key: `${stage.name}/${sp.id}/${variant}/L${load}/S${summer}` })
  return out
}

export interface BuiltCase {
  plan: PlannedTerm[]
  ms: number
  completed: Set<string>
  inProgress: string[]
  booked: Record<string, string[]>
  degreeId: string
  honours: boolean
  targets: string[]
  args: Parameters<typeof buildStudentPlan>
  /** With `result: true`: buildStudentPlanResult's output (plan is its terms). */
  result?: PlanResult
}
/** Builds one case. `shuffle` reverses/permutes every input collection (determinism checks). `extra` merges into the options. */
export function buildCase(c: Pick<MatrixCase, 'stage' | 'specId' | 'variant' | 'load' | 'summer'>, opts: { shuffle?: boolean; extra?: Partial<PlanOptions>; completed?: string[]; inProgress?: string[]; result?: boolean; start?: TermStart } = {}): BuiltCase {
  const st = c.stage
  let completedArr = [...(opts.completed ?? st.completed)]
  let specList = [...SPECS]
  let inProgArr = [...(opts.inProgress ?? st.inProgress)]
  if (opts.shuffle) { completedArr = completedArr.reverse(); specList = specList.reverse(); inProgArr = inProgArr.reverse() }
  const completed = new Set(completedArr)
  const inProgress = inProgArr.filter((x) => !completed.has(x))
  const cur = seasonNow(TODAY)
  const from = SEASONS.indexOf(cur)
  const currentByTerm = [...SEASONS.slice(from), ...SEASONS.slice(0, from)]
    .map((season) => ({ season, courses: inProgress.filter((x) => (st.terms[x] ?? cur) === season) }))
    .filter((g) => g.courses.length)
  const booked = bookedByTerm(currentByTerm, TODAY)
  const degree = computerScience.degrees!.find((d) => d.variant === c.variant)!
  const creds = computeCredentials(usask.programs, completed, computerScience.id)
  const planning = [...specList, ...creds.map((x) => x.spec)]
  const matches = computeMatches(SPECS, completed, degree as never)
  const hero = matches.find((m) => m.spec.id === c.specId)!
  const targets = [hero].filter((m) => m.remaining > 0).map((m) => m.spec)
  const args: Parameters<typeof buildStudentPlan> = [
    targets, planning, completed, inProgress, c.load, opts.start ?? c.stage.start,
    { springSummer: c.summer > 0, summerPerTerm: Math.max(1, c.summer), degree, booked, ...(opts.extra ?? {}) },
  ]
  const t0 = performance.now()
  const result = opts.result ? buildStudentPlanResult(...args) : undefined
  const plan = result ? result.terms : buildStudentPlan(...args)
  const ms = performance.now() - t0
  return { result, plan, ms, completed, inProgress, booked, degreeId: degree.id, honours: c.variant === 'bsc-honours', targets: targets.map((t) => t.id), args }
}

/** The graduation term: the last term holding a planned or booked course, as termOrd. */
/** The graduation term: the last term holding a planned or booked course (a full-year course in a Fall holds the next Winter too), as termOrd. */
export const graduationOrd = (plan: PlannedTerm[], booked: Record<string, string[]>) =>
  Math.max(
    0,
    ...plan.filter((t) => t.courses.length).map((t) => (t.courses.some((x) => x.fullYear) && parseTerm(t.label)?.season === 'Fall' ? (parseTerm(t.label)!.year + 1) * 10 : termOrd(t.label))),
    ...Object.entries(booked).filter(([, v]) => v.length).map(([l]) => termOrd(l)),
  )

export const planKey = (p: PlannedTerm[]) => JSON.stringify(p.map((t) => [t.label, t.courses.map((x) => x.code)]))

/**
 * The graduation term counting a full-year course's second half: a full-year course planned in a
 * Fall holds its seat through the next Winter, so that Winter is the last term it uses. Additive:
 * graduationOrd (what plan-baseline.json was measured with) is unchanged.
 */
export const graduationOrdFullYear = (plan: PlannedTerm[], booked: Record<string, string[]>) =>
  Math.max(
    graduationOrd(plan, booked),
    ...plan.flatMap((t) => t.courses.filter((x) => courseInfo[x.code]?.offered === 'full-year' && parseTerm(t.label)?.season === 'Fall').map(() => termOrd(t.label) + 8)),
  )

