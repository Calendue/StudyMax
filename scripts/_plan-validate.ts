// The independent plan validator: grades one plan against the hard rules (types.ts L0 and settled
// rules (a)-(e)) and the published degree, with no planner code. It reads only src/data/* and
// _degree-rules.ts at runtime; src/lib/plan.ts, planDegree.ts, degree.ts and src/lib/planner/* are
// imported as types only, so the engine can never grade itself.
//
// V1  load: planned courses in a term <= max(0, load - booked); <= 15 cu a Fall/Winter term counting
//     booked; no Spring/Summer term at a Spring/Summer load of 0; nothing before the start term.
//     A full-year course holds a seat (and half its cu) in its Fall and in the next Winter.
// V2  the course runs in that season and never in a term blocked for it; unknown offerings only in
//     Fall/Winter.
// V3  prerequisites strictly earlier, co-requisites (concurrent) same term or earlier, antirequisite
//     credit stands in for a prerequisite; no antirequisite clash.
// V4  credit-unit rules and the 300/400 level gates (30/60 cu passed), settled rule (a): an elective
//     slot is 3 cu toward the gates and subject-free credit rules once its term ends; booked courses
//     count after their term.
// V5  Honours standing only in an Honours plan.
// V6  at most 3 senior (300/400) CMPT a term, booked included; none in Spring/Summer.
// V7  no duplicates; nothing completed or in progress planned again, except a failed/withdrawn retake.
// V8  booked courses stay in their term (not moved, not planned elsewhere), unless an override freed them.
// V9  every override honoured: a failed/withdrew retake strictly after its term; a not-offered/later
//     course never in its blocked term.
// V10 the degree complete (_degree-rules' audit) and every target specialization complete.
// V11 nothing dropped silently: with a PlanResult, every shortfall of V10 names a course an error
//     diagnostic covers.
// V12 the internship year empty.
import { courseInfo } from '../src/data/prereqs.ts'
import { creditPrereqs } from '../src/data/creditPrereqs.ts'
import type { PlannedTerm, PlanResult, TermStart } from '../src/lib/plan.ts'
import type { CourseOverride } from '../src/lib/overrides.ts'
import type { Specialization } from '../src/data/specializations.ts'
import { auditPlan, cuOf, electiveLabel, isElective, levelOf, runsIn, subjectOf, VARIANTS, type Variant } from './_degree-rules.ts'

export type VRule = 'V1' | 'V2' | 'V3' | 'V4' | 'V5' | 'V6' | 'V7' | 'V8' | 'V9' | 'V10' | 'V11' | 'V12'
export const VRULES: VRule[] = ['V1', 'V2', 'V3', 'V4', 'V5', 'V6', 'V7', 'V8', 'V9', 'V10', 'V11', 'V12']
export interface Violation { rule: VRule; msg: string }

export interface ValidateInput {
  plan: PlannedTerm[]
  completed: Iterable<string>
  inProgress: Iterable<string>
  /** Booked (registered) courses by term label, BEFORE overrides. */
  booked: Record<string, string[]>
  load: number
  /** Spring/Summer load; 0 = no Spring/Summer term. */
  summer: number
  variant: Variant
  honours: boolean
  targets: Specialization[]
  start: TermStart
  overrides?: CourseOverride[]
  /** Extra blocked terms by code (on top of the not-offered/later overrides). */
  blocked?: Record<string, string[]>
  /** Internship year, by its Fall's calendar year. */
  away?: number | null
  /** The PlanResult, when the result variant was built (V11). */
  result?: PlanResult
  /** Skip V10/V11 (a plan without a degree). */
  noDegree?: boolean
}

const RANK: Record<string, number> = { Winter: 0, 'Spring/Summer': 1, Fall: 2 }
export const parseLabel = (l: string) => {
  const m = l.match(/^(Fall|Winter|Spring\/Summer) (\d{4})$/)
  return m ? { season: m[1] as 'Fall' | 'Winter' | 'Spring/Summer', year: Number(m[2]) } : null
}
export const ordOf = (l: string) => {
  const t = parseLabel(l)
  return t ? t.year * 10 + RANK[t.season] : Number.MAX_SAFE_INTEGER
}
const fullYear = (code: string) => !isElective(code) && courseInfo[code]?.offered === 'full-year'
/** The ord of the term a course taken in `ord` is passed after (a full-year Fall course: the next Winter). */
const endOrd = (code: string, ord: number) => (fullYear(code) && ord % 10 === 2 ? ord + 8 : ord)
const seniorCmpt = (code: string) =>
  isElective(code) ? /cmpt/i.test(electiveLabel(code)) && /senior|410|300|400/i.test(electiveLabel(code)) : subjectOf(code) === 'CMPT' && levelOf(code) >= 300
const show = (code: string) => (isElective(code) ? `"${electiveLabel(code)}"` : code)

/** The student's state after the overrides, computed independently of src/lib/overrides.ts. */
export function effectiveState(input: Pick<ValidateInput, 'completed' | 'inProgress' | 'booked' | 'overrides' | 'blocked'>) {
  const completed = new Set(input.completed)
  const inProgress = new Set([...input.inProgress].filter((c) => !completed.has(c)))
  const booked = new Map<string, string>() // code → term label
  for (const label of Object.keys(input.booked).sort()) for (const c of input.booked[label]) booked.set(c, label)
  const blocked = new Map<string, Set<string>>()
  for (const [c, ts] of Object.entries(input.blocked ?? {})) blocked.set(c, new Set(ts))
  const retakeAfter = new Map<string, number>() // code → ord it was failed/withdrawn in
  const freed = new Set<string>() // booked courses an override un-booked (may move)
  for (const o of input.overrides ?? []) {
    if (o.kind === 'failed' || o.kind === 'withdrew') {
      const had = completed.has(o.code) || inProgress.has(o.code) || booked.has(o.code)
      completed.delete(o.code)
      inProgress.delete(o.code)
      booked.delete(o.code)
      if (had) retakeAfter.set(o.code, Math.max(retakeAfter.get(o.code) ?? 0, ordOf(o.term)))
    } else {
      if (!blocked.has(o.code)) blocked.set(o.code, new Set())
      blocked.get(o.code)!.add(o.term)
      if (booked.get(o.code) === o.term) {
        booked.delete(o.code)
        inProgress.delete(o.code)
        freed.add(o.code)
      }
    }
  }
  // Transitively: a booked course that depended ONLY on a removed one is un-booked too.
  if (retakeAfter.size > 0) {
    for (let changed = true; changed; ) {
      changed = false
      const have = (c: string) => completed.has(c) || inProgress.has(c) || booked.has(c)
      for (const code of [...booked.keys()].sort()) {
        const groups = courseInfo[code]?.requires ?? []
        if (groups.some((g) => g.length > 0 && !g.some(have) && g.some((o) => retakeAfter.has(o) || freed.has(o)))) {
          booked.delete(code)
          inProgress.delete(code)
          freed.add(code)
          changed = true
        }
      }
    }
  }
  return { completed, inProgress, booked, blocked, retakeAfter, freed }
}

export function validatePlan(input: ValidateInput): Violation[] {
  const out: Violation[] = []
  const add = (rule: VRule, msg: string) => out.push({ rule, msg })
  const st = effectiveState(input)
  const startOrd = input.start.year * 10 + RANK[input.start.season]

  // Planned entries (booked courses echoed into the plan in their own term are not planned).
  interface P { code: string; label: string; ord: number }
  const planned: P[] = []
  for (const t of input.plan) {
    const ord = ordOf(t.label)
    if (!parseLabel(t.label)) add('V1', `an unlabelled term "${t.label}"`)
    for (const x of t.courses) {
      if (st.booked.get(x.code) === t.label) continue
      planned.push({ code: x.code, label: t.label, ord })
    }
  }

  // Every term that holds anything: seats, cu and senior CMPT, booked included.
  const terms = new Map<number, { label: string; seats: number; bookedSeats: number; cu: number; senior: string[] }>()
  const term = (ord: number, label: string) => {
    if (!terms.has(ord)) terms.set(ord, { label, seats: 0, bookedSeats: 0, cu: 0, senior: [] })
    return terms.get(ord)!
  }
  const winterAfter = (ord: number) => ord + 8
  const labelOf = (ord: number) => `${['Winter', 'Spring/Summer', 'Fall'][ord % 10]} ${Math.floor(ord / 10)}`
  const occupy = (code: string, ord: number, label: string, isBooked: boolean) => {
    const fy = fullYear(code) && ord % 10 === 2
    const spans = fy ? [ord, winterAfter(ord)] : [ord]
    for (const o of spans) {
      const t = term(o, o === ord ? label : labelOf(o))
      if (isBooked) t.bookedSeats++
      else t.seats++
      t.cu += cuOf(code) / spans.length
      if (seniorCmpt(code)) t.senior.push(code)
    }
  }
  for (const [code, label] of st.booked) occupy(code, ordOf(label), label, true)
  for (const p of planned) occupy(p.code, p.ord, p.label, false)

  // V1 / V6: per term.
  for (const ord of [...terms.keys()].sort((a, b) => a - b)) {
    const t = terms.get(ord)!
    const ss = ord % 10 === 1
    const cap = ss ? input.summer : input.load
    if (ss && input.summer === 0 && t.seats > 0) add('V1', `${t.label}: a Spring/Summer term at a Spring/Summer load of 0`)
    if (t.seats > Math.max(0, cap - t.bookedSeats)) add('V1', `${t.label}: ${t.seats} planned + ${t.bookedSeats} booked (load ${cap})`)
    if (!ss && t.cu > 15) add('V1', `${t.label}: ${t.cu} cu (max 15)`)
    if (t.senior.length > 3) add('V6', `${t.label}: ${t.senior.length} senior CMPT (${t.senior.map(show).join(', ')})`)
    if (ss && t.seats > 0) {
      const plannedSenior = planned.filter((p) => p.ord === ord && seniorCmpt(p.code))
      if (plannedSenior.length > 0) add('V6', `${t.label}: senior CMPT in Spring/Summer (${plannedSenior.map((p) => show(p.code)).join(', ')})`)
    }
  }
  for (const p of planned) if (p.ord < startOrd) add('V1', `${show(p.code)} planned in ${p.label}, before the start term`)

  // Passed before a term: completed, in-progress courses not booked anywhere (passed before the start),
  // and booked or planned courses whose (last) term ended earlier.
  const timeline: { code: string; end: number; ord: number }[] = [
    ...[...st.booked].map(([code, l]) => ({ code, ord: ordOf(l), end: endOrd(code, ordOf(l)) })),
    ...planned.map((p) => ({ code: p.code, ord: p.ord, end: endOrd(p.code, p.ord) })),
  ]
  const floating = [...st.inProgress].filter((c) => !st.booked.has(c))
  const passedBefore = (ord: number) => {
    const s = new Set([...st.completed, ...floating])
    for (const x of timeline) if (x.end < ord) s.add(x.code)
    return s
  }
  const sameTerm = (ord: number) => new Set(timeline.filter((x) => x.ord === ord).map((x) => x.code))
  const cuSum = (s: Set<string>, pred: (c: string) => boolean) => [...s].filter(pred).reduce((n, c) => n + cuOf(c), 0)

  const had = new Set([...st.completed, ...st.inProgress, ...st.booked.keys()])
  const seen = new Map<string, string>()
  for (const p of planned) {
    const { code, label, ord } = p
    const season = parseLabel(label)?.season
    const before = passedBefore(ord)
    const allCu = cuSum(before, () => true)
    if (isElective(code)) {
      const l = electiveLabel(code)
      if (/410/.test(l) && allCu < 60) add('V4', `${show(code)} in ${label} after only ${allCu} cu`)
      else if (/senior cmpt/i.test(l) && allCu < 30) add('V4', `${show(code)} in ${label} after only ${allCu} cu`)
      continue
    }
    // V7
    if (seen.has(code)) add('V7', `${code} planned twice (${seen.get(code)}, ${label})`)
    seen.set(code, label)
    if (had.has(code)) add('V7', `${code} planned in ${label}, but it's already ${st.completed.has(code) ? 'completed' : 'in progress or booked'}`)
    // V8
    const b = input.booked
    for (const [bl, codes] of Object.entries(b)) {
      if (codes.includes(code) && bl !== label && st.booked.get(code) === bl) add('V8', `${code} is booked in ${bl} but planned in ${label}`)
    }
    // V9
    const r = st.retakeAfter.get(code)
    if (r !== undefined && ord <= r) add('V9', `${code} retaken in ${label}, not after the term it was failed/withdrawn in`)
    const blockedHere = st.blocked.get(code)?.has(label)
    if (blockedHere) add('V9', `${code} planned in ${label}, a term it's marked not running`)
    // V2
    if (season) {
      const ok = runsIn(code, season)
      if (ok === false) add('V2', `${code} in ${label}, but it doesn't run in ${season}`)
      if (ok === null && season === 'Spring/Summer') add('V2', `${code} in ${label}, with no known offering`)
      if (fullYear(code) && season !== 'Fall') add('V2', `${code} (full-year) starts in ${label}, not a Fall`)
    }
    if (!courseInfo[code]) add('V2', `${code} is not in the catalogue`)
    // V3
    const now = sameTerm(ord)
    for (const g of courseInfo[code]?.requires ?? []) {
      const has = (o: string) => before.has(o) || (courseInfo[o]?.antirequisites ?? []).some((a) => before.has(a))
      if (g.length > 0 && !g.some(has)) add('V3', `${code} (${label}) before its prerequisite ${g.join('/')}`)
    }
    for (const g of courseInfo[code]?.concurrent ?? []) {
      if (g.length > 0 && !g.some((o) => before.has(o) || now.has(o))) add('V3', `${code} (${label}) without its co-requisite ${g.join('/')}`)
    }
    const clash = (courseInfo[code]?.antirequisites ?? []).filter((a) => had.has(a) || planned.some((q) => q.code === a && q.ord <= ord))
    if (clash.length > 0) add('V3', `${code} planned in ${label}, but the student has or takes ${clash.join(', ')} (an antirequisite)`)
    // V4 / V5
    for (const rule of [...(creditPrereqs[code] ?? []), ...(courseInfo[code]?.creditRequires ?? [])]) {
      if (rule.standing === 'honours' && !input.honours) {
        add('V5', `${code} needs Honours standing, planned in a ${VARIANTS[input.variant].name} plan`)
        continue
      }
      const filtered = !!rule.subjects || !!rule.level
      const have = filtered
        ? cuSum(before, (c) => !isElective(c) && (!rule.subjects || rule.subjects.includes(subjectOf(c))) && (!rule.level || levelOf(c) === rule.level))
        : allCu
      if (have < rule.cu) add('V4', `${code} (${label}) with ${have} of the ${rule.cu} cu${rule.level ? ` of ${rule.level}-level` : ''}${rule.subjects ? ` ${rule.subjects.join('/')}` : ''} it needs`)
    }
    const level = levelOf(code)
    if (level === 300 && allCu < 30) add('V4', `${code} (300-level) in ${label} after only ${allCu} cu`)
    if (level >= 400 && allCu < 60) add('V4', `${code} (400-level) in ${label} after only ${allCu} cu`)
  }

  // V9: a not-offered/later override in a term the plan still uses for that course (booked included).
  for (const [code, label] of st.booked) if (st.blocked.get(code)?.has(label)) add('V9', `${code} still booked in ${label}, a term it's marked not running`)

  // V12: the internship year.
  if (input.away != null) {
    const y = input.away
    for (const p of planned) if (p.ord === y * 10 + 2 || p.ord === (y + 1) * 10 || p.ord === (y + 1) * 10 + 1) add('V12', `${show(p.code)} planned in ${p.label}, the internship year`)
  }

  // V10 / V11: the degree and the targets.
  if (!input.noDegree) {
    const named = [...new Set([...st.completed, ...st.inProgress, ...st.booked.keys(), ...planned.filter((p) => !isElective(p.code)).map((p) => p.code)])]
    const slots = planned.filter((p) => isElective(p.code)).map((p) => p.code)
    const audit = auditPlan(named, slots, VARIANTS[input.variant])
    const errs = new Set((input.result?.diagnostics ?? []).filter((d) => d.level === 'error' && d.course).map((d) => d.course!.replace(/\s+/g, '')))
    // No error diagnostic: the plan claims to be complete (V10). With errors, a shortfall they don't
    // cover is a silent drop (V11).
    for (const msg of audit.problems) {
      if (errs.size > 0) add('V11', `degree: ${msg} (errors name ${[...errs].sort().join(', ')})`)
      else add('V10', `degree: ${msg}`)
    }
    const all = new Set(named)
    for (const spec of input.targets) {
      for (const g of spec.requirements) {
        const got = g.courses.filter((c) => all.has(c)).length
        if (got >= g.need) continue
        const covered = g.courses.some((c) => errs.has(c))
        if (covered) continue
        // A group with no course in the catalogue can only be answered by an error diagnostic (V11).
        const unplaceable = g.courses.every((c) => !courseInfo[c])
        add(errs.size > 0 || unplaceable ? 'V11' : 'V10', `${spec.id}: ${got} of ${g.need} from ${g.courses.join('/')}`)
      }
    }
  }
  return out
}

/** Violations grouped by rule. */
export const byRule = (vs: Violation[]) => {
  const m: Record<VRule, string[]> = Object.fromEntries(VRULES.map((r) => [r, []])) as unknown as Record<VRule, string[]>
  for (const v of vs) m[v.rule].push(v.msg)
  return m
}
