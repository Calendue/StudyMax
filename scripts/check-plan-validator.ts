// Grades every matrix plan with the independent validator (_plan-validate.ts): the 1,620 base plans
// and 4,860 override plans, 3 per base case:
//   fail  a Year-1 prerequisite (CMPT141 for even-indexed specializations, MATH163 for odd), in the
//         term it was taken (Fall 2026 in progress for B; Winter 2026 for the sample's completed
//         course; Fall 2026 for a first-year, who hasn't taken it: a no-op the engine must survive);
//   block the core course in the Winter the base plan chose: CMPT280 when Spring/Summer is 0, else
//         STAT242 (the other one if the plan doesn't hold it in a Winter; the sample, which has both,
//         blocks its first Winter-only planned course), kind 'not-offered';
//   drop  a Fall 2026 booked course, kind 'withdrew' (CMPT141 for B, CMPT332 for the sample, which
//         un-books its Winter CMPT434; CMPT141 for a first-year, a no-op).
// currentTerm is Fall 2026. Plans are built with buildStudentPlanResult so V11 sees the diagnostics.
//
// Run: node --experimental-strip-types --experimental-loader ./scripts/_resolve-ts-loader.mjs scripts/check-plan-validator.ts [--verbose]
import { matrixCases, buildCase, SPECS, type MatrixCase } from './_plan-matrix.ts'
import { validatePlan, VRULES, parseLabel, ordOf, type VRule, type Violation } from './_plan-validate.ts'
import { runsIn } from './_degree-rules.ts'
import type { CourseOverride } from '../src/lib/overrides.ts'
import type { PlannedTerm, TermStart } from '../src/lib/plan.ts'

const VERBOSE = process.argv.includes('--verbose')
const CURRENT: TermStart = { season: 'Fall', year: 2026 }

type Kind = 'base' | 'fail' | 'block' | 'drop'
const KINDS: Kind[] = ['base', 'fail', 'block', 'drop']
const counts: Record<Kind, Record<VRule, number>> = Object.fromEntries(KINDS.map((k) => [k, Object.fromEntries(VRULES.map((r) => [r, 0]))])) as never
const plansWith: Record<Kind, number> = { base: 0, fail: 0, block: 0, drop: 0 }
const built: Record<Kind, number> = { base: 0, fail: 0, block: 0, drop: 0 }
const examples: Record<string, string[]> = {}
let skipped = 0

function grade(kind: Kind, c: MatrixCase, overrides: CourseOverride[]) {
  const b = buildCase(c, { result: true, extra: { currentTerm: CURRENT, ...(overrides.length ? { overrides } : {}) } })
  built[kind]++
  const vs = validatePlan({
    plan: b.plan,
    completed: b.completed,
    inProgress: b.inProgress,
    booked: b.booked,
    load: c.load,
    summer: c.summer,
    variant: c.variant,
    honours: b.honours,
    targets: SPECS.filter((s) => b.targets.includes(s.id)),
    start: c.stage.start,
    overrides,
    result: b.result,
  })
  record(kind, c.key, vs, overrides)
  return b
}
function record(kind: Kind, key: string, vs: Violation[], overrides: CourseOverride[]) {
  if (vs.length > 0) plansWith[kind]++
  for (const v of vs) {
    counts[kind][v.rule]++
    const k = `${kind} ${v.rule}`
    const list = (examples[k] ??= [])
    if (VERBOSE || list.length < 3) list.push(`${key}${overrides.length ? ` [${overrides.map((o) => `${o.kind} ${o.code} ${o.term}`).join('; ')}]` : ''}: ${v.msg}`)
  }
}
const winterOf = (plan: PlannedTerm[], code: string) => plan.find((t) => parseLabel(t.label)?.season === 'Winter' && t.courses.some((x) => x.code === code))?.label

// Self-test: the validator must catch hand-broken plans (so a clean run isn't vacuous).
{
  const c = matrixCases().find((x) => x.key === 'first/algorithmics/bsc-4/L5/S0')!
  const b = buildCase(c)
  const input = (plan: PlannedTerm[]) => ({ plan, completed: b.completed, inProgress: b.inProgress, booked: b.booked, load: 5, summer: 0, variant: c.variant, honours: false, targets: SPECS.filter((s) => b.targets.includes(s.id)), start: c.stage.start })
  const clone = () => b.plan.map((t) => ({ label: t.label, courses: t.courses.map((x) => ({ ...x })) }))
  const termOf = (p: PlannedTerm[], code: string) => p.find((t) => t.courses.some((x) => x.code === code))!
  const move = (p: PlannedTerm[], code: string, to: string) => {
    const from = termOf(p, code)
    const x = from.courses.splice(from.courses.findIndex((y) => y.code === code), 1)[0]
    ;(p.find((t) => t.label === to) ?? (p.push({ label: to, courses: [] }), p.at(-1)!)).courses.push(x)
    return p
  }
  const fall = (p: PlannedTerm[]) => p.find((t) => t.label.startsWith('Fall'))!.label
  const mutants: [string, VRule, (p: PlannedTerm[]) => PlannedTerm[]][] = [
    ['overload a term', 'V1', (p) => { p[0].courses.push(...p[1].courses.splice(0)); return p }],
    ['Spring/Summer term at load 0', 'V1', (p) => move(p, p.at(-1)!.courses[0].code, 'Spring/Summer 2030')],
    ['STAT242 in a Fall', 'V2', (p) => move(p, 'STAT242', fall(p))],
    ['CMPT145 with CMPT141', 'V3', (p) => move(p, 'CMPT145', termOf(p, 'CMPT141').label)],
    ['CMPT370 in the first term', 'V4', (p) => move(p, 'CMPT370', p[0].label)],
    ['CMPT400 in a Four-year plan', 'V5', (p) => { p.at(-1)!.courses.push({ ...p.at(-1)!.courses[0], code: 'CMPT400' }); return p }],
    ['4 senior CMPT in one term', 'V6', (p) => { const last = p.at(-1)!.label; for (const code of p.flatMap((t) => t.courses.map((x) => x.code)).filter((x) => /^CMPT[34]/.test(x)).slice(0, 4)) move(p, code, last); return p }],
    ['a course twice', 'V7', (p) => { p.at(-1)!.courses.push({ ...p[0].courses[0] }); return p }],
    ['a required course dropped', 'V10', (p) => { const t = termOf(p, 'CMPT463'); t.courses = t.courses.filter((x) => x.code !== 'CMPT463'); return p }],
  ]
  const missed: string[] = []
  for (const [name, rule, f] of mutants) if (!validatePlan(input(f(clone()))).some((v) => v.rule === rule)) missed.push(`${name} (${rule})`)
  if (validatePlan(input(clone())).some((v) => v.rule !== 'V11')) missed.push('the unbroken plan has violations')
  const base = validatePlan({ ...input(clone()), overrides: [{ code: 'CMPT280', term: termOf(clone(), 'CMPT280').label, kind: 'not-offered' }] })
  if (!base.some((v) => v.rule === 'V9')) missed.push('a blocked term kept (V9)')
  const away = Math.floor(ordOf(clone()[2].label) / 10)
  if (!validatePlan({ ...input(clone()), away: clone()[2].label.startsWith('Fall') ? away : away - 1 }).some((v) => v.rule === 'V12')) missed.push('the internship year used (V12)')
  if (missed.length > 0) {
    console.error(`check-plan-validator: the validator missed: ${missed.join('; ')}`)
    process.exit(1)
  }
  console.log(`self-test: the validator catches all ${mutants.length + 2} hand-broken plans`)
}

const t0 = performance.now()
for (const c of matrixCases()) {
  const base = grade('base', c, [])
  const specIndex = SPECS.findIndex((s) => s.id === c.specId)
  // fail
  const failCode = specIndex % 2 === 0 ? 'CMPT141' : 'MATH163'
  const failTerm = c.stage.name === 'sample' ? 'Winter 2026' : 'Fall 2026'
  grade('fail', c, [{ code: failCode, term: failTerm, kind: 'failed' }])
  // block
  const first = c.summer === 0 ? 'CMPT280' : 'STAT242'
  const second = first === 'CMPT280' ? 'STAT242' : 'CMPT280'
  // The sample has both done: then the first Winter-only named course of the base plan.
  const winterOnly = base.plan.flatMap((t) => t.courses.map((x) => x.code)).filter((code) => runsIn(code, 'Winter') === true && runsIn(code, 'Fall') === false && runsIn(code, 'Spring/Summer') === false)
  const pick = [first, second, ...winterOnly].map((code) => ({ code, term: winterOf(base.plan, code) })).find((x) => x.term)
  if (pick) grade('block', c, [{ code: pick.code, term: pick.term!, kind: 'not-offered' }])
  else skipped++
  // drop
  const dropCode = c.stage.name === 'sample' ? 'CMPT332' : 'CMPT141'
  grade('drop', c, [{ code: dropCode, term: 'Fall 2026', kind: 'withdrew' }])
}
const secs = (performance.now() - t0) / 1000

for (const k of KINDS) {
  const row = VRULES.map((r) => `${r} ${counts[k][r]}`).join(' · ')
  console.log(`${k.padEnd(5)} ${String(built[k]).padStart(4)} plans, ${String(plansWith[k]).padStart(4)} with violations: ${row}`)
}
if (skipped) console.log(`block: ${skipped} base plans hold no Winter-only course (not built)`)
console.log(`${Object.values(built).reduce((a, b) => a + b, 0)} plans in ${secs.toFixed(1)} s`)
for (const k of Object.keys(examples).sort()) {
  console.log(`\n${k}:`)
  for (const e of examples[k]) console.log(`  ${e}`)
}
const total = KINDS.reduce((n, k) => n + VRULES.reduce((m, r) => m + counts[k][r], 0), 0)
if (total > 0) {
  console.error(`\ncheck-plan-validator: ${total} violation(s)`)
  process.exit(1)
}
console.log('\ncheck-plan-validator: every plan passes V1-V12')
