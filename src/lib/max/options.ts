// Max's recommendations (the get_plan_options tool): the student's real alternatives — a different
// pace, summers, another specialization — each scored by building the whole plan it would give,
// with the same regenerate() the Plan tab is checked against. So every graduation Max says matches
// what the tree will draw when the student says "show me". Pure: no DB, no Node builtins.
import { programs } from '../../data/programs/index.js'
import { computeMatches } from '../match.js'
import { isElective, type PlannedTerm } from '../plan.js'
import { regenerate, type AdapterInput } from './planningAdapter.js'
import type { ScenarioOp } from './types.js'

export type OptionTopic = 'specialization' | 'pace' | 'summer'

export interface PlanOption {
  label: string
  graduation: string | null
  /** "8 months sooner", "same finish", "a year later" — against the plan they have now. */
  vsNow: string
  coursesLeft: number
  /** Ready for run_scenario as-is. */
  ops: ScenarioOp[]
}

export interface PlanOptions {
  about: OptionTopic
  now: { graduation: string | null; coursesLeft: number }
  options: PlanOption[]
  recommended: PlanOption | null
  /** Why the recommended one, in a few words Max can say. */
  reason: string | null
}

const END_MONTH: Record<string, number> = { Winter: 4, 'Spring/Summer': 8, Fall: 12 }

/** "Winter 2028" → months since year 0 at the end of that term. */
function finishMonth(label: string | null): number | null {
  const m = label?.match(/^(Fall|Winter|Spring\/Summer) (\d{4})$/)
  return m ? Number(m[2]) * 12 + END_MONTH[m[1]] : null
}

/** How a finish compares with now, in the student's words. */
export function finishShift(now: string | null, then: string | null): string {
  const a = finishMonth(now)
  const b = finishMonth(then)
  if (a === null || b === null) return 'unknown'
  const d = b - a
  if (d === 0) return 'same finish'
  const months = Math.abs(d)
  const span = months % 12 === 0 ? (months === 12 ? 'a year' : `${months / 12} years`) : `${months} months`
  return `${span} ${d < 0 ? 'sooner' : 'later'}`
}

const graduationOf = (terms: PlannedTerm[]) => terms[terms.length - 1]?.label ?? null
const coursesIn = (terms: PlannedTerm[]) => terms.reduce((n, t) => n + t.courses.length, 0)

function option(base: AdapterInput, nowGrad: string | null, label: string, change: Partial<AdapterInput>, ops: ScenarioOp[]): PlanOption {
  const terms = regenerate({ ...base, ...change }).terms
  const graduation = graduationOf(terms)
  return { label, graduation, vsNow: finishShift(nowGrad, graduation), coursesLeft: coursesIn(terms), ops }
}

/** Earliest finish, then fewest courses left, then the order they were offered (deterministic). */
function rank(options: PlanOption[]): PlanOption[] {
  return options
    .map((o, i) => ({ o, i }))
    .sort((x, y) => (finishMonth(x.o.graduation) ?? Infinity) - (finishMonth(y.o.graduation) ?? Infinity) || x.o.coursesLeft - y.o.coursesLeft || x.i - y.i)
    .map(({ o }) => o)
}

/** The student's alternatives on one topic, best first (top 3), and which one Max should recommend. */
export function planOptions(base: AdapterInput, about: OptionTopic): PlanOptions {
  const nowTerms = regenerate(base).terms
  const now = { graduation: graduationOf(nowTerms), coursesLeft: coursesIn(nowTerms) }
  const candidates: PlanOption[] = []

  if (about === 'pace') {
    for (const n of [3, 4, 5]) {
      if (n === base.coursesPerTerm) continue
      candidates.push(
        option(base, now.graduation, `${n} courses a term`, { coursesPerTerm: n }, [{ op: 'SET_PREFERENCE', key: 'maxCoursesPerTerm', value: n }]),
      )
    }
  } else if (about === 'summer') {
    if (base.springSummer) {
      candidates.push(
        option(base, now.graduation, 'No Spring/Summer terms', { springSummer: false }, [{ op: 'SET_PREFERENCE', key: 'springSummer', value: false }]),
      )
    } else {
      for (const k of [1, 2]) {
        candidates.push(
          option(base, now.graduation, `Summers on, ${k} course${k === 1 ? '' : 's'} each`, { springSummer: true, summerPerTerm: k }, [
            { op: 'SET_PREFERENCE', key: 'springSummer', value: true },
            { op: 'SET_PREFERENCE', key: 'maxSummerCourses', value: k },
          ]),
        )
      }
    }
  } else {
    const program = programs.find((p) => p.id === base.targetProgramId)
    const degree = program?.degrees?.find((d) => d.variant === base.degreeVariant) ?? program?.degree
    const own = new Set(program?.specializations.map((s) => s.id) ?? [])
    const current = base.targetSpecializationIds.find((id) => own.has(id))
    const others = base.targetSpecializationIds.filter((id) => !own.has(id))
    const reachable = computeMatches(program?.specializations ?? [], base.completed, degree).filter(
      (m) => m.remaining > 0 && m.spec.id !== current && !m.spec.unavailable,
    )
    for (const m of reachable) {
      candidates.push(
        option(base, now.graduation, m.spec.name, { targetSpecializationIds: [m.spec.id, ...others] }, [
          { op: 'SET_SPECIALIZATIONS', specializationIds: [m.spec.id] },
        ]),
      )
    }
  }

  const options = rank(candidates).slice(0, 3)
  const best = options[0] ?? null
  // Only recommend a change that actually helps: an earlier finish, or the same finish with less left.
  const helps =
    best &&
    ((finishMonth(best.graduation) ?? Infinity) < (finishMonth(now.graduation) ?? Infinity) ||
      (best.graduation === now.graduation && best.coursesLeft < now.coursesLeft))
  const reason = !helps
    ? null
    : best.graduation !== now.graduation
      ? `it finishes ${best.vsNow}`
      : `same finish with ${now.coursesLeft - best.coursesLeft} fewer courses`
  return { about, now, options, recommended: helps ? best : null, reason }
}

/** Real course codes a plan still needs (elective slots aside) — for tests and captions. */
export const namedCourses = (terms: PlannedTerm[]) => terms.flatMap((t) => t.courses.map((c) => c.code)).filter((c) => !isElective(c))
