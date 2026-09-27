// The scheduling core against an exact oracle. A breadth-first search over (passed set, term index)
// finds the true earliest graduation of small CoreInput instances: 2,000 seeded random ones
// (mulberry32, fixed seed: 6-12 items, OR-groups, concurrent groups, seasons F / W / F+W / W+S / S,
// Fall/Winter loads 1-3, Spring/Summer 0-2, 0-2 blocked terms per item set, level-3 items behind the
// 30-cu gate, credit rules with and without a subject) and ~20 real CS subsets from the catalogue
// (CMPT141 → 145 → 263/214/215 → 270 → 280 → 370, MATH163, STAT241 → 242, MATH116, ...).
// For each: scheduleCore(input) (src/lib/planner/schedule.ts) must graduate exactly when the BFS
// minimum does (or both find it infeasible), its schedule must pass the instance validator below,
// and 'proven' must mean optimal. Without schedule.ts yet it self-tests the BFS against the
// validator and a brute-force check. BFS budget: < 200 ms an instance.
//
// Semantics (types.ts): an item passes when its term ends; each pre group needs an option passed
// earlier (a concurrent group: earlier or the same term); level 3 needs 30 cu passed, level 4 60;
// credit rules count passed cu (done, booked after their term, items), a subject-filtered rule only
// named items/done of those subjects (rule (a)); per term: cap seats, cuCap cu, seniorCap senior CMPT.
// Not generated: full-year items, level-filtered credit rules, assumedCuPerTerm.
//
// Run: node --experimental-strip-types --experimental-loader ./scripts/_resolve-ts-loader.mjs scripts/check-plan-oracle.ts [--verbose]
import { courseInfo } from '../src/data/prereqs.ts'
import { cuOf, levelOf, runsIn, subjectOf } from './_degree-rules.ts'
import type { CoreInput, CoreItem, CoreResult, CoreTerm, CreditRule, Season } from '../src/lib/planner/types.ts'

const VERBOSE = process.argv.includes('--verbose')
type Schedule = (input: CoreInput) => CoreResult
let scheduleCore: Schedule | null = null
try {
  const mod = (await import('../src/lib/planner/schedule.ts')) as { scheduleCore?: Schedule }
  scheduleCore = mod.scheduleCore ?? null
} catch {
  scheduleCore = null
}

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ───────────── the instance rules, shared by the validator and the BFS ─────────────

function passedCu(input: CoreInput, rule: CreditRule | null, passedItems: number[], term: number): number {
  const ok = (subject: string, named: boolean) => !rule?.subjects || (named && rule.subjects.includes(subject))
  let cu = 0
  for (const d of input.done) if (ok(d.subject, true)) cu += d.cu
  for (const b of input.booked) if (b.term < term && ok(b.subject, true)) cu += b.cu
  for (const i of passedItems) {
    const it = input.items[i]
    if (ok(it.subject, it.named)) cu += it.cu
  }
  return cu
}
/** Can item i sit in term t, given the items passed before t and those placed in t? */
function canPlace(input: CoreInput, i: number, t: number, before: Set<string>, same: Set<string>, passedIdx: number[]): string | null {
  const it = input.items[i]
  if (!it.allowed.includes(t)) return `not allowed in term ${t}`
  for (const g of it.pre) if (!g.opts.some((o) => before.has(o) || (g.concurrent && same.has(o)))) return `pre ${g.opts.join('/')}`
  const all = passedCu(input, null, passedIdx, t)
  if (it.level === 3 && all < 30) return `level 3 gate (${all} cu)`
  if (it.level >= 4 && all < 60) return `level 4 gate (${all} cu)`
  for (const r of it.credit) {
    const have = passedCu(input, r, passedIdx, t)
    if (have < r.cu) return `credit ${r.cu}${r.subjects ? ` ${r.subjects.join('/')}` : ''} (${have})`
  }
  return null
}
function termOk(input: CoreInput, t: number, idx: number[]): string | null {
  const term = input.terms[t]
  if (idx.length > term.cap) return `term ${t}: ${idx.length} > cap ${term.cap}`
  const cu = idx.reduce((n, i) => n + input.items[i].cu, 0)
  if (cu > term.cuCap) return `term ${t}: ${cu} cu > ${term.cuCap}`
  const senior = idx.filter((i) => input.items[i].seniorCmpt).length
  if (senior > term.seniorCap) return `term ${t}: ${senior} senior > ${term.seniorCap}`
  return null
}

/** Checks a schedule; returns problems. */
function validateSchedule(input: CoreInput, at: number[]): string[] {
  const out: string[] = []
  if (at.length !== input.items.length) return [`at has ${at.length} entries for ${input.items.length} items`]
  for (let t = 0; t < input.terms.length; t++) {
    const here = at.flatMap((x, i) => (x === t ? [i] : []))
    if (here.length === 0) continue
    const e = termOk(input, t, here)
    if (e) out.push(e)
    const beforeIdx = at.flatMap((x, i) => (x < t ? [i] : []))
    const before = new Set(beforeIdx.map((i) => input.items[i].id))
    const same = new Set(here.map((i) => input.items[i].id))
    for (const i of here) {
      const why = canPlace(input, i, t, before, same, beforeIdx)
      if (why) out.push(`${input.items[i].id} in term ${t}: ${why}`)
    }
  }
  for (const [i, x] of at.entries()) if (!(x >= 0 && x < input.terms.length)) out.push(`${input.items[i].id} at ${x}`)
  return out
}

/** Exact earliest graduation (last term index used), or -2 when nothing fits the horizon. */
function bfs(input: CoreInput): { grad: number; at: number[] | null; states: number } {
  const n = input.items.length
  if (n === 0) return { grad: -1, at: [], states: 0 }
  const full = (1 << n) - 1
  let layer = new Map<number, number[]>([[0, new Array(n).fill(-1)]]) // mask → a witness schedule
  let states = 0
  for (let t = 0; t < input.terms.length; t++) {
    const next = new Map<number, number[]>()
    for (const [mask, witness] of [...layer.entries()].sort((a, b) => a[0] - b[0])) {
      states++
      const passedIdx: number[] = []
      for (let i = 0; i < n; i++) if (mask & (1 << i)) passedIdx.push(i)
      const before = new Set(passedIdx.map((i) => input.items[i].id))
      // Candidates: allowed now, not passed, and each pre group met by passed or (concurrent) a candidate.
      const cand: number[] = []
      for (let i = 0; i < n; i++) if (!(mask & (1 << i)) && input.items[i].allowed.includes(t)) cand.push(i)
      const cap = Math.min(input.terms[t].cap, cand.length)
      const pick: number[] = []
      const visit = (from: number) => {
        if (pick.length > 0) {
          const same = new Set(pick.map((i) => input.items[i].id))
          if (!termOk(input, t, pick) && pick.every((i) => !canPlace(input, i, t, before, same, passedIdx))) {
            let m = mask
            for (const i of pick) m |= 1 << i
            if (!next.has(m)) {
              const w = [...witness]
              for (const i of pick) w[i] = t
              next.set(m, w)
            }
          }
        }
        if (pick.length === cap) return
        for (let k = from; k < cand.length; k++) {
          pick.push(cand[k])
          visit(k + 1)
          pick.pop()
        }
      }
      visit(0)
      if (!next.has(mask)) next.set(mask, witness)
    }
    const done = next.get(full)
    if (done) return { grad: t, at: done, states }
    layer = next
  }
  return { grad: -2, at: null, states }
}

// ───────────── instances ─────────────

const SEASON_SETS: Season[][] = [['Fall'], ['Winter'], ['Fall', 'Winter'], ['Winter', 'Spring/Summer'], ['Spring/Summer']]
function makeTerms(count: number, load: number, summer: number, startFall = true): CoreTerm[] {
  const out: CoreTerm[] = []
  let season: Season = startFall ? 'Fall' : 'Winter'
  let year = 2027
  while (out.length < count) {
    const ss = season === 'Spring/Summer'
    out.push({ label: `${season} ${year}`, season, cap: ss ? summer : load, cuCap: ss ? 3 * summer : 15, seniorCap: ss ? 0 : 3 })
    if (season === 'Fall') {
      season = 'Winter'
      year++
    } else if (season === 'Winter' && summer > 0) season = 'Spring/Summer'
    else season = 'Fall'
  }
  return out
}

function randomInstance(rand: () => number, seed: number): CoreInput {
  const r = (n: number) => Math.floor(rand() * n)
  const n = 6 + r(7)
  const load = 1 + r(3)
  const summer = r(3)
  const terms = makeTerms(Math.min(30, Math.ceil(n / load) * 3 + 4), load, summer, rand() < 0.7)
  const doneCu = [0, 0, 15, 24, 30][r(5)]
  const done = doneCu ? [{ code: 'DONE', cu: doneCu, level: 1, subject: 'MATH' }] : []
  const items: CoreItem[] = []
  for (let i = 0; i < n; i++) {
    const id = `X${String(i).padStart(2, '0')}`
    // Spring/Summer-only items only when there are Spring/Summer terms (else most instances are infeasible).
    const seasons = SEASON_SETS[r(10) < 6 ? 2 : r(summer > 0 ? SEASON_SETS.length : 3)]
    const blocked = new Set<number>()
    for (let b = r(3); b > 0; b--) blocked.add(r(terms.length))
    const allowed = terms.flatMap((t, k) => (seasons.includes(t.season) && t.cap > 0 && !blocked.has(k) ? [k] : []))
    const level = r(10) < 3 && doneCu + 3 * i >= 30 ? 3 : 1 + r(2)
    const subject = ['CMPT', 'MATH', 'STAT'][r(3)]
    const pre: CoreItem['pre'] = []
    if (i > 0) {
      for (let g = r(3); g > 0; g--) {
        const opts = [...new Set([items[r(i)].id, ...(r(3) === 0 ? [items[r(i)].id] : [])])].sort()
        pre.push({ opts, concurrent: r(5) === 0 })
      }
    }
    const credit: CreditRule[] = []
    if (r(8) === 0) credit.push({ cu: 3 * (1 + r(4)) })
    if (r(10) === 0) credit.push({ cu: 3 * (1 + r(2)), subjects: [subject] })
    const named = r(6) !== 0
    items.push({
      id,
      named,
      cu: 3,
      level,
      seniorCmpt: subject === 'CMPT' && level >= 3,
      fullYear: false,
      allowed,
      pre,
      credit,
      year: 1 + Math.floor(i / 4),
      group: i,
      subject: named ? subject : '',
    })
  }
  void seed
  return { items, terms, done, booked: [], nodeBudget: 200000 }
}

/** A real CS subset: items from the catalogue, groups outside the subset treated as met. */
function realInstance(codes: string[], load: number, summer: number, doneCodes: string[] = []): CoreInput {
  const set = new Set(codes)
  const terms = makeTerms(Math.min(30, Math.ceil(codes.length / load) * 3 + 6), load, summer, true)
  const done = doneCodes.map((c) => ({ code: c, cu: cuOf(c), level: levelOf(c) / 100, subject: subjectOf(c) }))
  const items: CoreItem[] = codes.map((code, g) => {
    const info = courseInfo[code]
    const pre: CoreItem['pre'] = []
    for (const grp of info?.requires ?? []) {
      const opts = grp.filter((o) => set.has(o))
      if (grp.length > 0 && opts.length > 0 && !grp.some((o) => doneCodes.includes(o))) pre.push({ opts: opts.sort(), concurrent: false })
    }
    for (const grp of info?.concurrent ?? []) {
      const opts = grp.filter((o) => set.has(o))
      if (grp.length > 0 && opts.length > 0 && !grp.some((o) => doneCodes.includes(o))) pre.push({ opts: opts.sort(), concurrent: true })
    }
    const allowed = terms.flatMap((t, k) => {
      const ok = runsIn(code, t.season)
      return (ok === true || (ok === null && t.season !== 'Spring/Summer')) && t.cap > 0 ? [k] : []
    })
    const level = levelOf(code) / 100
    return { id: code, named: true, cu: cuOf(code), level, seniorCmpt: subjectOf(code) === 'CMPT' && level >= 3, fullYear: false, allowed, pre, credit: [], year: level, group: g, subject: subjectOf(code) }
  })
  return { items, terms, done, booked: [], nodeBudget: 200000 }
}
const THIRTY = ['ENG111', 'ENG113', 'PSY120', 'PSY121', 'BIOL120', 'BIOL121', 'CHEM112', 'PHYS115', 'ECON111', 'INDG107']
const REAL: [string, string[], number, number, string[]][] = [
  ['core chain L2', ['CMPT141', 'CMPT145', 'CMPT263', 'CMPT214', 'CMPT215', 'CMPT270', 'CMPT280', 'MATH163'], 2, 0, []],
  ['core chain L3 +summer', ['CMPT141', 'CMPT145', 'CMPT263', 'CMPT214', 'CMPT215', 'CMPT270', 'CMPT280', 'MATH163'], 3, 2, []],
  ['core chain L1', ['CMPT141', 'CMPT145', 'CMPT214', 'CMPT270', 'CMPT280'], 1, 0, []],
  ['core + 370 L3 (30 cu done)', ['CMPT141', 'CMPT145', 'CMPT263', 'CMPT214', 'CMPT215', 'CMPT270', 'CMPT280', 'CMPT370'], 3, 0, THIRTY],
  ['core + 370 L2 +S1 (30 cu done)', ['CMPT141', 'CMPT145', 'CMPT214', 'CMPT270', 'CMPT280', 'CMPT370'], 2, 1, THIRTY],
  ['core + 370, gate unreachable', ['CMPT141', 'CMPT145', 'CMPT214', 'CMPT270', 'CMPT280', 'CMPT370'], 2, 0, []],
  ['stats L1', ['MATH110', 'MATH116', 'STAT241', 'STAT242'], 1, 0, []],
  ['stats L2 +S2', ['MATH110', 'MATH116', 'STAT241', 'STAT242'], 2, 2, []],
  ['AI chain (30 cu done) L2', ['MATH110', 'MATH116', 'STAT241', 'STAT242', 'CMPT141', 'CMPT145', 'CMPT280', 'CMPT317'], 2, 0, THIRTY],
  ['AI chain (30 cu done) L3', ['MATH110', 'MATH116', 'STAT241', 'STAT242', 'CMPT141', 'CMPT145', 'CMPT280', 'CMPT317'], 3, 0, THIRTY],
  ['year 1 L5', ['CMPT141', 'CMPT145', 'MATH110', 'MATH116', 'MATH163', 'MATH164', 'ENG111', 'ENG113'], 5, 0, []],
  ['year 1 L3', ['CMPT141', 'CMPT145', 'MATH110', 'MATH116', 'MATH163', 'MATH164', 'ENG111', 'ENG113'], 3, 0, []],
  ['year 1 L2 +S1', ['CMPT141', 'CMPT145', 'MATH110', 'MATH116', 'MATH163', 'MATH164', 'ENG111', 'ENG113'], 2, 1, []],
  ['year 1 L1 +S2', ['CMPT141', 'CMPT145', 'MATH110', 'MATH163', 'MATH164', 'ENG111'], 1, 2, []],
  ['systems (30 cu done) L3', ['CMPT141', 'CMPT145', 'CMPT214', 'CMPT215', 'CMPT270', 'CMPT280', 'CMPT332'], 3, 0, THIRTY],
  ['graphics prereqs L2', ['CMPT141', 'CMPT145', 'MATH110', 'MATH164', 'CMPT214', 'CMPT270', 'CMPT280'], 2, 0, []],
  ['discrete L1 +S1', ['MATH163', 'CMPT141', 'CMPT145', 'CMPT263'], 1, 1, []],
  ['core chain L4', ['CMPT141', 'CMPT145', 'CMPT263', 'CMPT214', 'CMPT215', 'CMPT270', 'CMPT280', 'MATH163', 'MATH110', 'MATH116'], 4, 0, []],
  ['core chain L5 +S2', ['CMPT141', 'CMPT145', 'CMPT263', 'CMPT214', 'CMPT215', 'CMPT270', 'CMPT280', 'MATH163', 'MATH110', 'MATH116'], 5, 2, []],
  ['core + 360 (30 done) L2', ['CMPT141', 'CMPT145', 'CMPT263', 'CMPT260', 'CMPT270', 'CMPT280', 'CMPT360'], 2, 0, THIRTY],
]

// ───────────── run ─────────────

const bfsMs: number[] = []
const engMs: number[] = []
const fails: string[] = []
let feasible = 0
let infeasible = 0
let proven = 0
const fmt = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  const q = (p: number) => s[Math.min(s.length - 1, Math.floor(s.length * p))]
  return s.length ? `p50 ${q(0.5).toFixed(1)} · p95 ${q(0.95).toFixed(1)} · max ${s.at(-1)!.toFixed(1)} ms` : '-'
}
function runOne(name: string, input: CoreInput) {
  const t0 = performance.now()
  const o = bfs(input)
  const ms = performance.now() - t0
  bfsMs.push(ms)
  if (ms > 200) fails.push(`${name}: the BFS took ${ms.toFixed(0)} ms (budget 200)`)
  if (o.grad === -2) {
    infeasible++
    if (name.startsWith('real')) console.log(`${name}: infeasible in ${input.terms.length} terms`)
  }
  else {
    feasible++
    const bad = validateSchedule(input, o.at!)
    if (bad.length) fails.push(`${name}: BFS witness invalid (oracle bug): ${bad[0]}`)
  }
  if (!scheduleCore) return
  const e0 = performance.now()
  let res: CoreResult
  try {
    res = scheduleCore(input)
  } catch (err) {
    fails.push(`${name}: scheduleCore threw ${(err as Error).message}`)
    return
  }
  engMs.push(performance.now() - e0)
  if (o.grad === -2) {
    if (res.at !== null || res.optimality !== 'infeasible') fails.push(`${name}: BFS finds it infeasible in ${input.terms.length} terms; the engine returned ${res.optimality} graduating at ${res.graduation}${res.at ? ` (${validateSchedule(input, res.at)[0] ?? 'its schedule validates?!'})` : ''}`)
    return
  }
  if (!res.at) {
    fails.push(`${name}: engine found no schedule (${res.optimality}); BFS graduates at term ${o.grad} (${input.terms[o.grad].label})`)
    return
  }
  const bad = validateSchedule(input, res.at)
  if (bad.length) fails.push(`${name}: engine schedule breaks a rule: ${bad.slice(0, 3).join('; ')}`)
  const last = Math.max(-1, ...res.at)
  if (last !== res.graduation) fails.push(`${name}: engine graduation ${res.graduation} but its last placed term is ${last}`)
  if (res.graduation !== o.grad) fails.push(`${name}: engine graduates at term ${res.graduation}, the optimum is ${o.grad} (${res.optimality})${res.optimality === 'proven' ? ' — it CLAIMS proven' : ''}`)
  if (res.optimality === 'proven') proven++
  if (res.lowerBound > o.grad) fails.push(`${name}: engine lowerBound ${res.lowerBound} is above the optimum ${o.grad}`)
}

const SEED = 20260927
const rand = mulberry32(SEED)
const t0 = performance.now()
for (let k = 0; k < 2000; k++) runOne(`random#${k}`, randomInstance(rand, k))
for (const [name, codes, load, summer, done] of REAL) runOne(`real: ${name}`, realInstance(codes, load, summer, done))

// Self-test of the oracle: on small instances a brute force over every assignment agrees with the BFS.
let brute = 0
{
  const r2 = mulberry32(SEED + 1)
  for (let k = 0; k < 150; k++) {
    const inst = randomInstance(r2, k)
    inst.items = inst.items.slice(0, 5).map((it) => ({ ...it, pre: it.pre.map((g) => ({ ...g, opts: g.opts.filter((o) => inst.items.slice(0, 5).some((x) => x.id === o)) })).filter((g) => g.opts.length) }))
    inst.terms = inst.terms.slice(0, 7)
    inst.items = inst.items.map((it) => ({ ...it, allowed: it.allowed.filter((t) => t < 7) }))
    const o = bfs(inst)
    let best = -2
    const at = new Array(inst.items.length).fill(0)
    const rec = (i: number) => {
      if (i === at.length) {
        const g = Math.max(...at)
        if ((best === -2 || g < best) && validateSchedule(inst, at).length === 0) best = g
        return
      }
      for (const t of inst.items[i].allowed) {
        at[i] = t
        rec(i + 1)
      }
    }
    rec(0)
    brute++
    if (best !== o.grad) fails.push(`oracle self-test #${k}: brute force ${best}, BFS ${o.grad}`)
  }
}
const secs = (performance.now() - t0) / 1000

console.log(`${2000 + REAL.length} instances (${feasible} feasible, ${infeasible} infeasible in their horizon) + ${brute} brute-force self-tests in ${secs.toFixed(1)} s`)
console.log(`BFS: ${fmt(bfsMs)}`)
if (scheduleCore) console.log(`engine: ${fmt(engMs)} · ${proven} claimed proven`)
else console.log('engine: src/lib/planner/schedule.ts has no scheduleCore yet: oracle self-test only')
if (fails.length) {
  for (const f of VERBOSE ? fails : fails.slice(0, 25)) console.log(`  ${f}`)
  console.error(`\ncheck-plan-oracle: ${fails.length} failure(s)`)
  process.exit(1)
}
console.log(`\ncheck-plan-oracle: ${scheduleCore ? 'the engine matches the exact optimum on every instance' : 'the oracle agrees with brute force'}`)
