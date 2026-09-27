// The scheduling core: given the courses already selected, the terms and what's done or booked,
// the earliest graduation term under the hard rules (L0/L1 in types.ts), found by list scheduling
// against deadlines worked back from a candidate graduation term H = LB, LB+1, ... and, when the
// lists miss, an exact depth-first search at H. Pure and deterministic: budgets count nodes, ties
// break on plain `<`, nothing reads the clock.
import type { BindingKind, CoreInput, CoreItem, CoreResult, CreditRule } from './types.js'

const DEFAULT_BUDGET = 3000
const INF = 1 << 29

interface Ctx {
  items: CoreItem[]
  n: number
  T: number
  pre: { opts: number[]; conc: boolean }[][]
  allowed: Uint8Array[]
  cap: number[]
  cuCap: number[]
  seniorCap: number[]
  fw: boolean[]
  season: string[]
  /** Cu passed before terms[0]. */
  base: number
  /** Booked cu finishing in term u (passed from u+1). */
  bookedCu: number[]
  /** Passed-course entries before terms[0] and by booked term, for credit rules. */
  doneEntries: { cu: number; level: number; subject: string; named: boolean }[]
  bookedEntries: { term: number; cu: number; level: number; subject: string; named: boolean }[]
  assumed: number
  namedCreditOnly: boolean
  /** Each item's dependants (item index, concurrent, the group has only this option). */
  deps: { d: number; conc: boolean; single: boolean }[][]
  year: number[]
  due: number[]
  chain: number[]
  /** Earliest term per item (set once the lower bound is known). */
  earliest: number[]
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

function makeCtx(input: CoreInput, capOverride?: number[]): Ctx {
  const items = input.items
  const n = items.length
  const T = input.terms.length
  const index = new Map(items.map((it, i) => [it.id, i]))
  const pre = items.map((it) => it.pre.map((g) => ({ opts: g.opts.filter((o) => index.has(o)).map((o) => index.get(o)!).sort((a, b) => a - b), conc: g.concurrent })))
  const cap = capOverride ?? input.terms.map((t) => Math.max(0, t.cap))
  const allowed = items.map((it) => {
    const a = new Uint8Array(T)
    for (const t of it.allowed) {
      if (t < 0 || t >= T || cap[t] <= 0) continue
      if (it.fullYear && (t + 1 >= T || cap[t + 1] <= 0)) continue
      a[t] = 1
    }
    return a
  })
  const bookedCu = new Array(T).fill(0)
  let base = input.done.reduce((s, d) => s + d.cu, 0)
  for (const b of input.booked) {
    if (b.term < 0) base += b.cu
    else if (b.term < T) bookedCu[b.term] += b.cu
  }
  const deps: Ctx['deps'] = items.map(() => [])
  pre.forEach((groups, d) => groups.forEach((g) => g.opts.forEach((o) => deps[o].push({ d, conc: g.conc, single: g.opts.length === 1 }))))
  // Advising year pulled ahead of what depends on it; longest chain of dependants.
  const due = items.map((it) => it.year)
  const chain = new Array(n).fill(0)
  for (let pass = 0; pass < n + 1; pass++) {
    let changed = false
    for (let i = 0; i < n; i++) {
      for (const x of deps[i]) {
        const y = Math.max(1, due[x.d] - (x.conc ? 0 : 1))
        if (y < due[i]) { due[i] = y; changed = true }
        if (chain[x.d] + 1 > chain[i] && chain[x.d] + 1 <= n) { chain[i] = chain[x.d] + 1; changed = true }
      }
    }
    if (!changed) break
  }
  return {
    items, n, T, pre, allowed, cap,
    cuCap: input.terms.map((t) => t.cuCap),
    seniorCap: input.terms.map((t) => Math.max(0, t.seniorCap)),
    fw: input.terms.map((t) => t.season !== 'Spring/Summer'),
    season: input.terms.map((t) => t.season),
    base, bookedCu,
    doneEntries: [
      ...input.done.map((d) => ({ cu: d.cu, level: d.level, subject: d.subject, named: true })),
      ...input.booked.filter((b) => b.term < 0).map((b) => ({ cu: b.cu, level: b.level, subject: b.subject, named: true })),
    ],
    bookedEntries: input.booked.filter((b) => b.term >= 0).map((b) => ({ term: b.term, cu: b.cu, level: b.level, subject: b.subject, named: true })),
    assumed: input.assumedCuPerTerm ?? 0,
    namedCreditOnly: Boolean(input.namedCreditOnly),
    deps, year: items.map((it) => it.year), due, chain, earliest: new Array(n).fill(0),
  }
}

// ---- placement state ----

interface State {
  at: Int32Array
  seats: Int32Array
  cu: Float64Array
  sen: Int32Array
  /** Planned cu finishing in term u. */
  fin: Float64Array
  placed: number
}

function newState(c: Ctx): State {
  return { at: new Int32Array(c.n).fill(-1), seats: new Int32Array(c.T), cu: new Float64Array(c.T), sen: new Int32Array(c.T), fin: new Float64Array(c.T), placed: 0 }
}

function place(c: Ctx, s: State, i: number, t: number, sign: 1 | -1) {
  const it = c.items[i]
  const span = it.fullYear ? 2 : 1
  for (let k = 0; k < span; k++) {
    s.seats[t + k] += sign
    s.cu[t + k] += (sign * it.cu) / span
    if (it.seniorCmpt) s.sen[t + k] += sign
  }
  s.fin[t + span - 1] += sign * it.cu
  s.at[i] = sign === 1 ? t : -1
  s.placed += sign
}

/** Cu passed before term t (rule (a): slots count 3; rule (e): a Fall/Winter term is at least `assumed`). */
function gate(c: Ctx, s: State, t: number): number {
  let cu = c.base
  for (let u = 0; u < t; u++) {
    const actual = s.fin[u] + c.bookedCu[u]
    cu += c.fw[u] && c.assumed > 0 && c.cap[u] + c.bookedCu[u] > 0 ? Math.max(c.assumed, actual) : actual
  }
  return cu
}

const finish = (c: Ctx, i: number, at: number) => at + (c.items[i].fullYear ? 1 : 0)

const countsFor = (c: Ctx, rule: CreditRule, e: { level: number; subject: string; named: boolean }) =>
  e.named ? (!rule.subjects || rule.subjects.includes(e.subject)) && (!rule.level || e.level * 100 === rule.level) : !c.namedCreditOnly && !rule.subjects && !rule.level

function ruleMet(c: Ctx, s: State, rule: CreditRule, t: number): boolean {
  if (rule.standing) return true
  return ruleCu(c, s, rule, t) >= rule.cu
}

function ruleCu(c: Ctx, s: State, rule: CreditRule, t: number): number {
  const counts = (e: { level: number; subject: string; named: boolean }) => countsFor(c, rule, e)
  let cu = 0
  for (const e of c.doneEntries) if (counts(e)) cu += e.cu
  for (const e of c.bookedEntries) if (e.term < t && counts(e)) cu += e.cu
  for (let i = 0; i < c.n; i++) {
    const a = s.at[i]
    if (a < 0 || finish(c, i, a) >= t) continue
    const it = c.items[i]
    if (counts({ level: it.level, subject: it.subject, named: it.named })) cu += it.cu
  }
  return cu
}

/** Whether item i may start in term t, given what's placed (and `chosen`, placed in t already, for corequisites). */
function eligible(c: Ctx, s: State, i: number, t: number, g: number): boolean {
  if (!c.allowed[i][t]) return false
  const it = c.items[i]
  if (it.level === 3 && g < 30) return false
  if (it.level >= 4 && g < 60) return false
  for (const grp of c.pre[i]) {
    let ok = false
    for (const o of grp.opts) {
      const a = s.at[o]
      if (a < 0) continue
      const f = finish(c, o, a)
      if (f < t || (grp.conc && a <= t)) { ok = true; break }
    }
    if (!ok) return false
  }
  for (const r of it.credit) if (!ruleMet(c, s, r, t)) return false
  return true
}

function fits(c: Ctx, s: State, i: number, t: number): boolean {
  const it = c.items[i]
  const span = it.fullYear ? 2 : 1
  for (let k = 0; k < span; k++) {
    const u = t + k
    if (s.seats[u] + 1 > c.cap[u]) return false
    if (s.cu[u] + it.cu / span > c.cuCap[u] + 1e-9) return false
    if (it.seniorCmpt && s.sen[u] + 1 > c.seniorCap[u]) return false
  }
  return true
}

// ---- lower bound ----

interface Bound { lb: number; kind: BindingKind; detail: string; chain?: number[]; earliest: number[] }

function lowerBound(c: Ctx): Bound {
  // The most cu that could be passed before each term.
  const maxItemCu = Math.max(3, ...c.items.map((i) => i.cu))
  const totalCu = c.items.reduce((s, i) => s + i.cu, 0)
  const reach: number[] = []
  let acc = c.base
  let plannable = 0
  for (let u = 0; u < c.T; u++) {
    reach.push(acc)
    const room = Math.min(c.cuCap[u], c.cap[u] * maxItemCu, Math.max(0, totalCu - plannable))
    plannable += room
    const actual = room + c.bookedCu[u]
    acc += c.fw[u] && c.assumed > 0 && c.cap[u] + c.bookedCu[u] > 0 ? Math.max(c.assumed, actual) : actual
  }
  const gateT = (cu: number) => { const i = reach.findIndex((x) => x >= cu); return i < 0 ? INF : i }
  const memo = new Array<number>(c.n).fill(-1)
  const via = new Array<number>(c.n).fill(-1)
  const onStack = new Uint8Array(c.n)
  const e = (i: number): number => {
    if (memo[i] >= 0) return memo[i]
    if (onStack[i]) return INF
    onStack[i] = 1
    let t = 0
    for (const g of c.pre[i]) {
      let best = INF, arg = -1
      for (const o of g.opts) {
        const v = e(o)
        const w = v >= INF ? INF : v + (g.conc ? 0 : c.items[o].fullYear ? 2 : 1)
        if (w < best) { best = w; arg = o }
      }
      if (best > t) { t = best; via[i] = arg }
    }
    const it = c.items[i]
    if (it.level === 3) t = Math.max(t, gateT(30))
    if (it.level >= 4) t = Math.max(t, gateT(60))
    for (const r of it.credit) if (!r.standing) t = Math.max(t, gateT(r.cu))
    while (t < c.T && !c.allowed[i][t]) t++
    if (t >= c.T) t = INF
    onStack[i] = 0
    memo[i] = t
    return t
  }
  const earliest = c.items.map((_, i) => e(i))
  let lb = -1, kind: BindingKind = 'none', detail = '', chainIds: number[] | undefined
  if (c.n === 0) return { lb: -1, kind, detail, earliest }
  // chain
  let arg = 0
  for (let i = 1; i < c.n; i++) if (earliest[i] > earliest[arg]) arg = i
  lb = earliest[arg]
  kind = 'chain'
  const path: number[] = []
  for (let k = arg; k >= 0 && path.length <= c.n; k = via[k]) path.unshift(k)
  chainIds = path
  detail = 'prerequisite chain'
  if (lb >= INF) return { lb: INF, kind, detail: 'unreachable', chain: chainIds, earliest }
  const levelOrGate = c.items[arg].level >= 3 && path.length === 1
  if (levelOrGate) kind = 'gate'
  // capacity
  const seatsNeeded = c.items.reduce((s, it) => s + (it.fullYear ? 2 : 1), 0)
  let seats = 0, capT = INF
  for (let u = 0; u < c.T; u++) { seats += c.cap[u]; if (seats >= seatsNeeded) { capT = u; break } }
  if (capT > lb) { lb = capT; kind = 'capacity'; detail = `${c.n} courses`; chainIds = undefined }
  // one-season courses: those whose allowed terms all share one season
  const bySeason = new Map<string, number[]>()
  for (let i = 0; i < c.n; i++) {
    const seasons = new Set<string>()
    for (let u = 0; u < c.T; u++) if (c.allowed[i][u]) seasons.add(c.season[u])
    if (seasons.size === 1) { const k = [...seasons][0]; bySeason.set(k, [...(bySeason.get(k) ?? []), i]) }
  }
  for (const [key, only] of [...bySeason].sort(([x], [y]) => cmp(x, y))) {
    let need = only.length
    let last = -1
    for (let t = Math.min(...only.map((i) => earliest[i])); t < c.T && need > 0; t++) if (c.season[t] === key) { need -= c.cap[t]; last = t }
    const v = need > 0 ? INF : last
    if (v > lb) { lb = v; kind = 'season'; detail = `${only.length} ${key}-only courses`; chainIds = undefined }
  }
  // senior CMPT throughput
  const sen = c.items.map((it, i) => (it.seniorCmpt ? i : -1)).filter((i) => i >= 0)
  if (sen.length > 0) {
    let need = sen.length
    let t = Math.min(...sen.map((i) => earliest[i]))
    let last = -1
    for (; t < c.T && need > 0; t++) { const k = Math.min(c.seniorCap[t], c.cap[t]); if (k > 0) { need -= k; last = t } }
    const v = need > 0 ? INF : last
    if (v > lb) { lb = v; kind = 'senior'; detail = `${sen.length} senior CMPT courses`; chainIds = undefined }
  }
  return { lb, kind, detail, chain: chainIds, earliest }
}

// ---- deadlines ----

function deadlines(c: Ctx, H: number, earliest: number[], pack: boolean): number[] {
  const memo = new Array<number>(c.n).fill(INF)
  const busy = new Uint8Array(c.n)
  const l = (i: number): number => {
    if (memo[i] < INF) return memo[i]
    if (busy[i]) return H
    busy[i] = 1
    let b = H - (c.items[i].fullYear ? 1 : 0)
    for (const x of c.deps[i]) if (x.single) b = Math.min(b, l(x.d) - (x.conc ? 0 : c.items[i].fullYear ? 2 : 1))
    while (b >= 0 && !c.allowed[i][b]) b--
    busy[i] = 0
    memo[i] = b
    return b
  }
  const dl = c.items.map((_, i) => l(i))
  if (!pack) return dl
  // Backward packing: from H down, each term takes the unpacked items due by then that can't start
  // any earlier (latest earliest-start first), within its seats and senior room.
  const packed = new Array<number>(c.n).fill(-1)
  const seats = new Array<number>(c.T).fill(0)
  const sen = new Array<number>(c.T).fill(0)
  for (let u = H; u >= 0; u--) {
    const cand = []
    for (let i = 0; i < c.n; i++) if (packed[i] < 0 && dl[i] >= u && c.allowed[i][u] && !c.items[i].fullYear) cand.push(i)
    cand.sort((a, b) => earliest[b] - earliest[a] || dl[a] - dl[b] || b - a)
    for (const i of cand) {
      if (seats[u] >= c.cap[u]) break
      if (c.items[i].seniorCmpt && sen[u] >= c.seniorCap[u]) continue
      seats[u]++
      if (c.items[i].seniorCmpt) sen[u]++
      packed[i] = u
    }
  }
  const out = dl.map((d, i) => (packed[i] >= 0 ? Math.min(d, packed[i]) : d))
  // Prerequisites tighten again behind the packed dependants.
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < c.n; i++) {
      let b = out[i]
      for (const x of c.deps[i]) if (x.single) b = Math.min(b, out[x.d] - (x.conc ? 0 : c.items[i].fullYear ? 2 : 1))
      while (b >= 0 && !c.allowed[i][b]) b--
      out[i] = b
    }
  }
  return out
}

// ---- list scheduling ----

type Prio = 'template' | 'edf'

function listSchedule(c: Ctx, H: number, dl: number[], prio: Prio, missed?: { item: number; before?: number }): Int32Array | null {
  const s = newState(c)
  let paced: Uint8Array = new Uint8Array(c.n)
  const keyOf = (i: number, t: number, year: number): number[] => {
    const it = c.items[i]
    if (prio === 'edf') return [dl[i], c.due[i], c.year[i], it.loose ? 1 : 0, -c.chain[i], it.named ? 0 : 1, it.group]
    return [dl[i] <= t ? 0 : paced[i] ? 1 : 2, c.due[i] > year ? 1 : 0, c.year[i], it.loose ? 1 : 0, -c.chain[i], c.due[i], dl[i], it.named ? 0 : 1, it.named ? it.level : 0, it.group]
  }
  for (let t = 0; t <= H && t < c.T; t++) {
    const g = gate(c, s, t)
    const year = Math.floor(g / 30) + 1
    if (prio === 'template') paced = pacing(c, s, t, H, dl)
    const order: number[] = []
    for (let i = 0; i < c.n; i++) if (s.at[i] < 0) order.push(i)
    const keys = new Map(order.map((i) => [i, keyOf(i, t, year)]))
    order.sort((a, b) => {
      const ka = keys.get(a)!, kb = keys.get(b)!
      for (let k = 0; k < ka.length; k++) if (ka[k] !== kb[k]) return ka[k] - kb[k]
      return cmp(c.items[a].id, c.items[b].id)
    })
    for (let grew = true; grew; ) {
      grew = false
      for (const i of order) {
        if (s.at[i] >= 0) continue
        if (s.seats[t] >= c.cap[t]) break
        if (!fits(c, s, i, t) || !eligible(c, s, i, t, g)) continue
        // The last seat: not a term of nothing but free electives while a requirement could go.
        if (c.items[i].free && s.seats[t] + 1 === c.cap[t] && s.seats[t] > 0 && dl[i] > t) {
          let allFree = true
          for (let j = 0; j < c.n && allFree; j++) if (s.at[j] === t && !c.items[j].free) allFree = false
          if (allFree && order.some((j) => s.at[j] < 0 && !c.items[j].free && fits(c, s, j, t) && eligible(c, s, j, t, g))) continue
        }
        place(c, s, i, t, 1)
        grew = true
      }
    }
    for (let i = 0; i < c.n; i++) {
      if (s.at[i] < 0 && dl[i] <= t) {
        if (missed) {
          missed.item = i
          // Blamed on a prerequisite that wasn't passed in time, when that's why it couldn't go.
          if (c.allowed[i][t]) {
            for (const grp of c.pre[i]) {
              const met = grp.opts.some((o) => s.at[o] >= 0 && (finish(c, o, s.at[o]) < t || (grp.conc && s.at[o] <= t)))
              if (met) continue
              let best = -1
              for (const o of grp.opts) if (best < 0 || dl[o] < dl[best]) best = o
              if (best >= 0) { missed.item = best; missed.before = grp.conc ? t : t - 1; break }
            }
            // Short of credit: a course that counts toward the rule, still to place, moves up.
            if (missed.item === i) {
              const g = gate(c, s, t)
              const it = c.items[i]
              const rule = it.credit.find((r) => !r.standing && !ruleMet(c, s, r, t))
              const gateShort = (it.level === 3 && g < 30) || (it.level >= 4 && g < 60)
              if (rule || gateShort) {
                let pick = -1
                for (let j = 0; j < c.n; j++) {
                  if (j === i || (s.at[j] >= 0 && s.at[j] < t)) continue
                  if (rule && !countsFor(c, rule, c.items[j])) continue
                  if (c.earliest[j] >= t) continue
                  if (pick < 0 || dl[j] > dl[pick] || (dl[j] === dl[pick] && c.earliest[j] < c.earliest[pick])) pick = j
                }
                if (pick >= 0) { missed.item = pick; missed.before = t - 1 }
              }
            }
            // No room: a course in this term that could have gone earlier moves up instead.
            if (missed.item === i) {
              const seniorBound = c.items[i].seniorCmpt && s.sen[t] >= c.seniorCap[t]
              let pick = -1
              for (let j = 0; j < c.n; j++) {
                if (j === i || s.at[j] !== t || (seniorBound && !c.items[j].seniorCmpt)) continue
                let earlier = false
                for (let u = 0; u < t; u++) if (c.allowed[j][u]) { earlier = true; break }
                if (!earlier || dl[j] < t) continue
                if (pick < 0 || c.earliest[j] < c.earliest[pick] || (c.earliest[j] === c.earliest[pick] && (dl[j] > dl[pick] || (dl[j] === dl[pick] && c.chain[j] < c.chain[pick])))) pick = j
              }
              if (pick >= 0) { missed.item = pick; missed.before = t - 1 }
            }
          }
        }
        return null
      }
    }
  }
  return s.placed === c.n ? s.at : null
}

/**
 * Classes that can't all wait: senior CMPT courses (three a term at most) and courses left with one
 * season to run in. When a class has more courses pending than seats after this term, it goes first.
 */
function pacing(c: Ctx, s: State, t: number, H: number, dl: number[]): Uint8Array {
  const out = new Uint8Array(c.n)
  const pending: number[] = []
  for (let i = 0; i < c.n; i++) if (s.at[i] < 0) pending.push(i)
  const seniors = pending.filter((i) => c.items[i].seniorCmpt)
  let future = 0
  for (let u = t + 1; u <= H && u < c.T; u++) future += Math.max(0, Math.min(c.seniorCap[u] - s.sen[u], c.cap[u] - s.seats[u]))
  if (seniors.length > future) for (const i of seniors) out[i] = 1
  const bySeason = new Map<string, number[]>()
  for (const i of pending) {
    let only = ''
    let multi = false
    for (let u = t; u <= H && u < c.T; u++) {
      if (!c.allowed[i][u]) continue
      if (only === '') only = c.season[u]
      else if (only !== c.season[u]) { multi = true; break }
    }
    if (!multi && only !== '') bySeason.set(only, [...(bySeason.get(only) ?? []), i])
  }
  for (const [season, list] of bySeason) {
    let seats = 0
    for (let u = t + 1; u <= H && u < c.T; u++) if (c.season[u] === season) seats += Math.max(0, c.cap[u] - s.seats[u])
    if (list.length > seats) for (const i of list) out[i] = 1
  }
  // Courses that can't go in a Spring/Summer term, against the Fall/Winter seats left.
  const fwOnly = pending.filter((i) => {
    for (let u = t; u <= H && u < c.T; u++) if (c.allowed[i][u] && !c.fw[u]) return false
    return true
  })
  let fwSeats = 0
  for (let u = t + 1; u <= H && u < c.T; u++) if (c.fw[u]) fwSeats += Math.max(0, c.cap[u] - s.seats[u])
  if (fwOnly.length >= fwSeats) for (const i of fwOnly) out[i] = 1
  // Credit rules with a deadline: when the courses that count toward one barely fit the seats left
  // before it's due, they go first.
  for (const i of pending) {
    for (const rule of c.items[i].credit) {
      if (rule.standing) continue
      const short = rule.cu - ruleCu(c, s, rule, t)
      if (short <= 0) continue
      const due = dl[i]
      let seats = 0
      for (let u = t; u < due && u < c.T; u++) seats += Math.max(0, c.cap[u] - s.seats[u])
      if (Math.ceil(short / 3) + 1 >= seats) for (const j of pending) if (j !== i && countsFor(c, rule, c.items[j])) out[j] = 1
    }
  }
  return out
}

// ---- exact search ----

interface Dfs { at: Int32Array | null; proven: boolean; nodes: number }

function exact(c: Ctx, H: number, dl: number[], budget: number): Dfs {
  const s = newState(c)
  const failed = new Set<string>()
  let nodes = 0
  let exhausted = false
  const sig = (i: number) => {
    const it = c.items[i]
    if (it.named || c.deps[i].length > 0) return 'N' + i
    return `E${it.level}|${it.seniorCmpt}|${it.cu}|${dl[i]}|${c.due[i]}|${it.credit.length}|${Array.from(c.allowed[i]).join('')}`
  }
  const rec = (t: number): boolean => {
    if (s.placed === c.n) return true
    if (t > H || t >= c.T) return false
    if (nodes >= budget) { exhausted = true; return false }
    nodes++
    const g = gate(c, s, t)
    let fy = ''
    for (let i = 0; i < c.n; i++) if (s.at[i] === t - 1 && c.items[i].fullYear) fy += i + ','
    let bits = ''
    for (let i = 0; i < c.n; i++) bits += s.at[i] >= 0 ? '1' : '0'
    const key = `${t}|${g}|${fy}|${bits}`
    if (failed.has(key)) return false
    let left = 0
    for (let i = 0; i < c.n; i++) {
      if (s.at[i] >= 0) continue
      if (dl[i] < t) { failed.add(key); return false }
      left += c.items[i].fullYear ? 2 : 1
    }
    let room = 0
    for (let u = t; u <= H && u < c.T; u++) room += Math.max(0, c.cap[u] - s.seats[u])
    if (room < left) { failed.add(key); return false }
    // Candidates: eligible now, then those a same-term corequisite among them would unlock.
    const base: number[] = []
    for (let i = 0; i < c.n; i++) if (s.at[i] < 0 && eligible(c, s, i, t, g)) base.push(i)
    const cands = [...base]
    const baseSet = new Set(base)
    for (let i = 0; i < c.n; i++) {
      if (s.at[i] >= 0 || baseSet.has(i) || !c.allowed[i][t]) continue
      // Tentatively place every base candidate, see if i becomes eligible.
      for (const b of base) s.at[b] = t
      const ok = eligible(c, s, i, t, g)
      for (const b of base) s.at[b] = -1
      if (ok) cands.push(i)
    }
    const year = Math.floor(g / 30) + 1
    const rank = (i: number) => [dl[i] <= t ? 0 : 1, c.due[i] > year ? 1 : 0, c.year[i], c.items[i].loose ? 1 : 0, -c.chain[i], dl[i], c.items[i].named ? 0 : 1, i]
    const ranks = new Map(cands.map((i) => [i, rank(i)]))
    cands.sort((a, b) => {
      const ka = ranks.get(a)!, kb = ranks.get(b)!
      for (let k = 0; k < ka.length; k++) if (ka[k] !== kb[k]) return ka[k] - kb[k]
      return 0
    })
    const pick: number[] = []
    const skipped = new Set<string>()
    const valid = () => {
      // Each pick's corequisite groups met by the passed or the picks.
      for (const i of pick) if (!eligible(c, s, i, t, g)) return false
      return true
    }
    const run = (): boolean => {
      const inner = (j: number): boolean => {
        if (exhausted) return false
        if (j === cands.length) {
          // Every subset tried counts toward the budget, so one wide term can't run away.
          if (++nodes >= budget) { exhausted = true; return false }
          const ok0 = valid()
          let ok = ok0
          if (ok) {
            // Maximal subsets only: leaving out a course that still fits never helps (move it earlier
            // and nothing gets worse) — except a full-year course, whose Winter seat can be the one a
            // later course needs, so leaving it out is a real branch.
            for (const i of cands) {
              if (s.at[i] >= 0 || c.items[i].fullYear || !fits(c, s, i, t)) continue
              if (eligible(c, s, i, t, g)) { ok = false; break }
            }
          }
          return ok && rec(t + 1)
        }
        const i = cands[j]
        const sg = sig(i)
        if (!skipped.has(sg) && fits(c, s, i, t)) {
          place(c, s, i, t, 1)
          pick.push(i)
          if (inner(j + 1)) return true
          pick.pop()
          place(c, s, i, t, -1)
        }
        const had = skipped.has(sg)
        skipped.add(sg)
        const ok = inner(j + 1)
        if (!had) skipped.delete(sg)
        return ok
      }
      return inner(0)
    }
    const ok = run()
    if (!ok && !exhausted) failed.add(key)
    return ok
  }
  const ok = rec(0)
  return { at: ok ? s.at : null, proven: !exhausted, nodes }
}

/** Moves item i's deadline to its previous allowed term, and its prerequisites' behind it. False when it can't move. */
function tighten(c: Ctx, dl: number[], i: number, before?: number): boolean {
  if (i < 0) return false
  let b = before !== undefined && before < dl[i] ? before : dl[i] - 1
  while (b >= 0 && !c.allowed[i][b]) b--
  if (b < 0) return false
  dl[i] = b
  const stack = [i]
  while (stack.length > 0) {
    const x = stack.pop()!
    for (const g of c.pre[x]) {
      if (g.opts.length !== 1) continue
      const p = g.opts[0]
      let d = dl[x] - (g.conc ? 0 : c.items[p].fullYear ? 2 : 1)
      while (d >= 0 && !c.allowed[p][d]) d--
      if (d < dl[p]) { dl[p] = d; stack.push(p) }
    }
  }
  return true
}

// ---- the core ----

function solveAt(c: Ctx, H: number, earliest: number[], budget: { left: number }): { at: Int32Array | null; proven: boolean } {
  const chainDl = deadlines(c, H, earliest, false)
  const packedDl = deadlines(c, H, earliest, true)
  // Template order, tightening the deadline of whatever misses (and its prerequisites) and trying
  // again: a senior CMPT slot squeezed out of the last term moves up a term, and so on.
  const dl = [...chainDl]
  for (let round = 0; round < Math.min(3 * c.n, 30); round++) {
    const missed: { item: number; before?: number } = { item: -1 }
    const at = listSchedule(c, H, dl, 'template', missed)
    if (at) return { at, proven: true }
    if (!tighten(c, dl, missed.item, missed.before)) break
  }
  for (const [dl, prio] of [[packedDl, 'template'], [packedDl, 'edf'], [chainDl, 'edf']] as const) {
    const at = listSchedule(c, H, dl, prio)
    if (at) return { at, proven: true }
  }
  if (budget.left <= 0) return { at: null, proven: false }
  const r = exact(c, H, chainDl, budget.left)
  budget.left -= r.nodes
  return { at: r.at, proven: r.proven }
}

/** The lower bound on the graduation term index alone (-1 with nothing to place; a huge number when unreachable). */
export function coreLowerBound(input: CoreInput): number {
  const c = makeCtx(input)
  return c.n === 0 ? -1 : lowerBound(c).lb
}

export function scheduleCore(input: CoreInput): CoreResult {
  const c = makeCtx(input)
  const budget = { left: input.nodeBudget ?? DEFAULT_BUDGET }
  const startNodes = budget.left
  if (c.n === 0) return { at: [], graduation: -1, lowerBound: -1, optimality: 'proven', binding: { kind: 'none', detail: '' }, nodes: 0 }
  const b = lowerBound(c)
  c.earliest = b.earliest
  const binding = { kind: b.kind, detail: b.detail, ...(b.chain ? { chain: b.chain.map((i) => c.items[i].id) } : {}) }
  if (b.lb >= INF) return { at: null, graduation: -1, lowerBound: -1, optimality: 'infeasible', binding, nodes: 0 }
  let proven = true
  let found: Int32Array | null = null
  let G = -1
  for (let H = b.lb; H < c.T; H++) {
    const r = solveAt(c, H, b.earliest, budget)
    if (r.at) { found = r.at; G = H; break }
    if (!r.proven) proven = false
  }
  if (!found) return { at: null, graduation: -1, lowerBound: b.lb, optimality: 'infeasible', binding, nodes: startNodes - budget.left }
  // L3: drop Spring/Summer terms from the last backward while the graduation term still holds.
  const capNow = [...c.cap]
  let usesSummer = false
  for (let i = 0; i < c.n; i++) if (input.terms[found[i]].season === 'Spring/Summer') usesSummer = true
  if (usesSummer) {
    for (let u = G; u >= 0; u--) {
      if (input.terms[u].season !== 'Spring/Summer' || capNow[u] === 0) continue
      const trial = [...capNow]
      trial[u] = 0
      const tc = makeCtx(input, trial)
      const tb = lowerBound(tc)
      tc.earliest = tb.earliest
      if (tb.lb > G) continue
      const r = solveAt(tc, G, tb.earliest, { left: Math.min(budget.left, 200) })
      if (r.at) { capNow[u] = 0; found = r.at }
    }
  }
  let last = -1
  for (let i = 0; i < c.n; i++) last = Math.max(last, found[i] + (c.items[i].fullYear ? 1 : 0))
  return {
    at: Array.from(found),
    graduation: last,
    lowerBound: b.lb,
    optimality: proven || last === b.lb ? 'proven' : 'best-found',
    binding,
    nodes: startNodes - budget.left,
  }
}
