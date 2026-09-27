// Properties of the planner over the 1,620-case matrix (_plan-matrix.ts):
//   determinism   3 repeat builds, reversed inputs and rotated inputs give byte-identical plans (planKey)
//   monotonicity  load k+1 never later than k; Spring/Summer s+1 never later than s; a failed,
//                 withdrawn or not-offered override never EARLIER than the base; one more completed
//                 course (the base plan's first planned course) never later. A fail/withdraw that
//                 frees a seat (the removed or un-booked course isn't taken again) may finish earlier.
//   booked        booked courses never move (never planned outside their own term)
//   prefix        a not-offered block in term X leaves every term before X identical
//   replan        mark the plan's first planned term passed (its courses into completed, start at the
//                 next term) and the rest reproduces, compared by (term, code or elective label); only
//                 where that term holds no elective slot (a slot can't be marked completed)
//   baseline      never later than scripts/plan-baseline.json (the greedy planner, which broke the full-year
//                 seat rule in 396 Honours plans); counts improvements. Measured like the baseline (labels
//                 only); every other graduation counts a full-year course's Winter half.
//   runtime       each plan < 50 ms, p95 < 20 ms, the whole suite < 60 s
// Exit 1 on any break. The overrides are check-plan-validator.ts's (fail CMPT141/MATH163, block
// CMPT280/STAT242 in its Winter, withdraw a Fall 2026 booking), with currentTerm Fall 2026.
//
// Run: node --experimental-strip-types --experimental-loader ./scripts/_resolve-ts-loader.mjs scripts/check-plan-properties.ts [--verbose]
import { readFileSync } from 'node:fs'
import { buildCase, graduationOrd, graduationOrdFullYear, matrixCases, parseTerm, planKey, SPECS, termOrd, type MatrixCase } from './_plan-matrix.ts'
import { isElective, electiveLabel, runsIn } from './_degree-rules.ts'
import type { CourseOverride } from '../src/lib/overrides.ts'
import type { PlannedTerm, TermStart } from '../src/lib/plan.ts'

const VERBOSE = process.argv.includes('--verbose')
const CURRENT: TermStart = { season: 'Fall', year: 2026 }
const baseline = JSON.parse(readFileSync(new URL('./plan-baseline.json', import.meta.url), 'utf8')) as Record<string, number>

const breaks = new Map<string, string[]>()
const brk = (prop: string, msg: string) => {
  if (!breaks.has(prop)) breaks.set(prop, [])
  breaks.get(prop)!.push(msg)
}
const stats = { freed: 0, improved: 0, same: 0, replanChecked: 0, replanSkipped: 0, prefixChecked: 0 }
const times: { ms: number; key: string }[] = []
const ordLabel = (o: number) => `${['Winter', 'Spring/Summer', 'Fall'][o % 10]} ${Math.floor(o / 10)}`
const showOrd = (o: number) => (o > 0 ? ordLabel(o) : 'nothing')
const nextTerm = (t: TermStart, summer: number): TermStart =>
  t.season === 'Fall' ? { season: 'Winter', year: t.year + 1 } : t.season === 'Winter' && summer > 0 ? { season: 'Spring/Summer', year: t.year } : { season: 'Fall', year: t.year }
const slotKey = (p: PlannedTerm[]) => JSON.stringify(p.filter((t) => t.courses.length).map((t) => [t.label, t.courses.map((x) => (isElective(x.code) ? `slot:${electiveLabel(x.code)}` : x.code)).sort()]))
const winterOf = (plan: PlannedTerm[], code: string) => plan.find((t) => parseTerm(t.label)?.season === 'Winter' && t.courses.some((x) => x.code === code))?.label

function overridesFor(c: MatrixCase, plan: PlannedTerm[]): [string, CourseOverride][] {
  const i = SPECS.findIndex((s) => s.id === c.specId)
  const out: [string, CourseOverride][] = []
  out.push(['fail', { code: i % 2 === 0 ? 'CMPT141' : 'MATH163', term: c.stage.name === 'sample' ? 'Winter 2026' : 'Fall 2026', kind: 'failed' }])
  const first = c.summer === 0 ? 'CMPT280' : 'STAT242'
  const winterOnly = plan.flatMap((t) => t.courses.map((x) => x.code)).filter((code) => runsIn(code, 'Winter') === true && runsIn(code, 'Fall') === false && runsIn(code, 'Spring/Summer') === false)
  const pick = [first, first === 'CMPT280' ? 'STAT242' : 'CMPT280', ...winterOnly].map((code) => ({ code, term: winterOf(plan, code) })).find((x) => x.term)
  if (pick) out.push(['block', { code: pick.code, term: pick.term!, kind: 'not-offered' }])
  out.push(['drop', { code: c.stage.name === 'sample' ? 'CMPT332' : 'CMPT141', term: 'Fall 2026', kind: 'withdrew' }])
  return out
}

const t0 = performance.now()
const grad = new Map<string, number>()
for (const c of matrixCases()) {
  const b = buildCase(c)
  let ms = b.ms
  const key = planKey(b.plan)
  // Graduation counts a full-year course's Winter half; the baseline gate uses the baseline's own
  // measure (graduationOrd, labels only) so the two are compared like for like.
  const g = graduationOrdFullYear(b.plan, b.booked)
  const gLabels = graduationOrd(b.plan, b.booked)
  grad.set(c.key, g)

  // determinism
  for (let r = 0; r < 2; r++) {
    const again = buildCase(c)
    ms = Math.min(ms, again.ms)
    if (planKey(again.plan) !== key) brk('determinism', `${c.key}: repeat build ${r + 2} differs`)
  }
  // A plan's time is the fastest of its 3 identical builds (GC and JIT noise aside).
  times.push({ ms, key: c.key })
  if (planKey(buildCase(c, { shuffle: true }).plan) !== key) brk('determinism', `${c.key}: reversed inputs differ`)
  const rot = <T,>(a: T[]) => (a.length > 1 ? [...a.slice(1), a[0]] : a)
  if (planKey(buildCase(c, { completed: rot(c.stage.completed), inProgress: rot(c.stage.inProgress) }).plan) !== key) brk('determinism', `${c.key}: rotated inputs differ`)

  // baseline
  const was = baseline[c.key]
  if (was === undefined) brk('baseline', `${c.key}: not in plan-baseline.json`)
  else if (gLabels > was) brk('baseline', `${c.key}: ${showOrd(gLabels)}, later than the greedy planner's ${showOrd(was)}`)
  else if (gLabels < was) stats.improved++
  else stats.same++

  // booked never move
  for (const t of b.plan) for (const x of t.courses) {
    const home = Object.entries(b.booked).find(([, codes]) => codes.includes(x.code))?.[0]
    if (home && home !== t.label) brk('booked', `${c.key}: ${x.code} booked in ${home} but planned in ${t.label}`)
  }

  // overrides: never earlier; a block leaves the prefix
  for (const [kind, o] of overridesFor(c, b.plan)) {
    const r = buildCase(c, { result: true, extra: { currentTerm: CURRENT, overrides: [o] } })
    const og = graduationOrdFullYear(r.plan, r.booked)
    // A failed/withdrawn course (or one it un-booked) that the plan doesn't take again frees its seat
    // and its senior-CMPT room: finishing earlier is then legitimate (sample: dropping CMPT332 un-books
    // CMPT434, which the degree doesn't need, and CMPT364 fits the freed Winter 2027 senior slot).
    const removed = [o.code, ...(r.result?.diagnostics ?? []).filter((d) => d.code === 'UNBOOKED' && d.course).map((d) => d.course!.replace(/\s+/g, ''))]
    const plannedNow = new Set(r.plan.flatMap((t) => t.courses.map((x) => x.code)))
    const freed = o.kind !== 'not-offered' && [...new Set([...c.stage.completed, ...c.stage.inProgress])].some((x) => removed.includes(x) && !plannedNow.has(x))
    if (og < g && freed) stats.freed++
    else if (og < g) brk(`monotone-${kind}`, `${c.key} [${o.kind} ${o.code} ${o.term}]: ${showOrd(og)}, earlier than the base's ${showOrd(g)}`)
    if (kind === 'block') {
      stats.prefixChecked++
      const x = termOrd(o.term)
      const pre = (p: PlannedTerm[]) => planKey(p.filter((t) => termOrd(t.label) < x && t.courses.length))
      if (pre(r.plan) !== pre(b.plan)) brk('prefix', `${c.key} [not-offered ${o.code} ${o.term}]: terms before ${o.term} changed`)
    }
  }

  // one more completed course (the base plan's first named planned course) never later
  const extra = b.plan.flatMap((t) => t.courses).find((x) => !isElective(x.code))?.code
  if (extra) {
    const r = buildCase(c, { completed: [...c.stage.completed, extra], inProgress: c.stage.inProgress.filter((x) => x !== extra) })
    const eg = graduationOrdFullYear(r.plan, r.booked)
    if (eg > g) brk('monotone-completed', `${c.key} (+${extra} completed): ${showOrd(eg)}, later than ${showOrd(g)}`)
  }

  // replan idempotence
  const firstIdx = b.plan.findIndex((t) => t.courses.length > 0)
  const first = b.plan[firstIdx]
  if (first && !first.courses.some((x) => isElective(x.code))) {
    stats.replanChecked++
    const bookedThere = b.booked[first.label] ?? []
    const done = [...new Set([...c.stage.completed, ...first.courses.map((x) => x.code), ...bookedThere])]
    const start = nextTerm(parseTerm(first.label)!, c.summer)
    const r = buildCase(c, { completed: done, inProgress: c.stage.inProgress.filter((x) => !done.includes(x)), start })
    const rest = b.plan.slice(firstIdx + 1)
    if (slotKey(r.plan) !== slotKey(rest)) {
      const diff = [...r.plan, ...rest].map((t) => t.label).sort((x, y) => termOrd(x) - termOrd(y)).find((l) => slotKey(r.plan.filter((t) => t.label === l)) !== slotKey(rest.filter((t) => t.label === l)))
      brk('replan', `${c.key} (passed ${first.label}): the rest changed${diff ? `, first at ${diff}` : ''}`)
    }
  } else stats.replanSkipped++
}

// load / Spring/Summer monotonicity
for (const c of matrixCases()) {
  const me = grad.get(c.key)!
  const at = (load: number, summer: number) => grad.get(`${c.stage.name}/${c.specId}/${c.variant}/L${load}/S${summer}`)
  if (c.load < 5 && at(c.load + 1, c.summer)! > me) brk('monotone-load', `${c.key}: L${c.load + 1} ${showOrd(at(c.load + 1, c.summer)!)}, later than L${c.load} ${showOrd(me)}`)
  if (c.summer < 2 && at(c.load, c.summer + 1)! > me) brk('monotone-summer', `${c.key}: S${c.summer + 1} ${showOrd(at(c.load, c.summer + 1)!)}, later than S${c.summer} ${showOrd(me)}`)
}

// runtime (the per-plan time is the fastest of the 3 repeat builds)
const wall = (performance.now() - t0) / 1000
const sorted = [...times].sort((a, b) => a.ms - b.ms)
const p = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))].ms
const slowest = sorted.at(-1)!
for (const t of times) if (t.ms >= 50) brk('runtime', `${t.key}: ${t.ms.toFixed(1)} ms (budget 50)`)
if (p(0.95) >= 20) brk('runtime', `p95 ${p(0.95).toFixed(1)} ms (budget 20)`)
if (wall >= 60) brk('runtime', `suite ${wall.toFixed(1)} s (budget 60)`)

console.log(`${times.length} cases · per plan p50 ${p(0.5).toFixed(1)} ms · p95 ${p(0.95).toFixed(1)} ms · max ${slowest.ms.toFixed(1)} ms (${slowest.key}) · suite ${wall.toFixed(1)} s`)
console.log(`overrides: ${stats.freed} finish earlier because a removed course isn't taken again (freed seat, not a break)`)
console.log(`baseline: ${stats.improved} earlier than the greedy planner, ${stats.same} the same`)
console.log(`replan checked on ${stats.replanChecked} (skipped ${stats.replanSkipped}: first term holds an elective slot); prefix checked on ${stats.prefixChecked}`)
const PROPS = ['determinism', 'monotone-load', 'monotone-summer', 'monotone-fail', 'monotone-block', 'monotone-drop', 'monotone-completed', 'booked', 'prefix', 'replan', 'baseline', 'runtime']
console.log(PROPS.map((k) => `${k} ${breaks.get(k)?.length ?? 0}`).join(' · '))
for (const k of PROPS) {
  const list = breaks.get(k)
  if (!list) continue
  console.log(`\n${k}:`)
  for (const m of VERBOSE ? list : list.slice(0, 5)) console.log(`  ${m}`)
}
const total = [...breaks.values()].reduce((n, l) => n + l.length, 0)
if (total > 0) {
  console.error(`\ncheck-plan-properties: ${total} break(s)`)
  process.exit(1)
}
console.log('\ncheck-plan-properties: every property holds')
