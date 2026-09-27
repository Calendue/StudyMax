// From the selected courses to the scheduling core's input: the terms (load, Spring/Summer,
// internship year, booked seats), each course's allowed terms, prerequisites still to schedule and
// credit rules, and the diagnostics for what can't be placed under the hard rules. A course that
// can't be placed (and everything waiting on it) is left out with an error, never placed with a
// rule bent (settled rule (d)). Pure.
import type { Catalog, CoreInput, CoreItem, CoreTerm, CreditRule, Diagnostic, Season } from './types.js'

export interface ModelTerm {
  season: Season
  year: number
}

export interface ModelCourse {
  /** Course code, or an `elective:<n>:<label>` slot. */
  id: string
  named: boolean
  cu: number
  level: number
  seniorCmpt: boolean
  year: number
  group: number
  loose: boolean
  /** Free or senior elective (C5). */
  free?: boolean
  /** Slots only: may go in a Spring/Summer term. */
  summerOk?: boolean
}

export interface ModelInput {
  courses: ModelCourse[]
  catalog: Catalog
  start: ModelTerm
  /** Fall/Winter load, 1-5. */
  load: number
  /** Spring/Summer load, 0-2 (0 = no Spring/Summer terms). */
  summer: number
  /** Internship academic year (by its Fall), or null. */
  away: number | null
  /** Credited before the start (completed and in progress, minus what's booked). */
  passed: Set<string>
  /** Antirequisite credit: a course the student may not take, which stands in for it as a prerequisite. */
  credited: (code: string) => boolean
  booked: Record<string, readonly string[]>
  blocked: Record<string, readonly string[]>
  honours: boolean
  maxCu: number
  maxSeniorCmpt: number
  /** Prerequisites that aren't in the plan count as met (buildPlan's includePrerequisites: false). */
  ignoreMissing?: boolean
  /** Rule (e): no degree. */
  assumedCuPerTerm?: number
  nodeBudget?: number
  /** Credit rules count named courses only (CoreInput.namedCreditOnly). */
  namedCreditOnly?: boolean
  cuOf: (code: string) => number
  levelOf: (code: string) => number
  /** Horizon in terms (default 60). */
  horizon?: number
}

export interface Model {
  core: CoreInput
  labels: string[]
  seasons: Season[]
  /** Courses left out of the plan (with an error diagnostic). */
  dropped: string[]
  diagnostics: Diagnostic[]
}

export const subjectOf = (code: string) => code.match(/^[A-Z]+/)?.[0] ?? ''
export const spaced = (code: string) => code.replace(/^([A-Z]+)(\d)/, '$1 $2')
const order = (t: ModelTerm) => t.year * 10 + (t.season === 'Winter' ? 0 : t.season === 'Spring/Summer' ? 1 : 2)
const academicYear = (t: ModelTerm) => (t.season === 'Fall' ? t.year : t.year - 1)
const labelOf = (t: ModelTerm) => `${t.season} ${t.year}`
const next = (t: ModelTerm, summer: boolean): ModelTerm =>
  t.season === 'Fall' ? { season: 'Winter', year: t.year + 1 } : t.season === 'Winter' && summer ? { season: 'Spring/Summer', year: t.year } : { season: 'Fall', year: t.year }
const parse = (label: string): ModelTerm | null => {
  const m = label.match(/^(Fall|Winter|Spring\/Summer) (\d{4})$/)
  return m ? { season: m[1] as Season, year: Number(m[2]) } : null
}

export function buildModel(m: ModelInput): Model {
  const diagnostics: Diagnostic[] = []
  const horizon = m.horizon ?? 60
  const summerOn = m.summer > 0
  const terms: ModelTerm[] = [m.start]
  while (terms.length < horizon) terms.push(next(terms[terms.length - 1], summerOn))
  const labels = terms.map(labelOf)
  const seasons = terms.map((t) => t.season)
  const indexOf = new Map(labels.map((l, i) => [l, i]))

  // Booked: fixed seats in their term; passed once it's over.
  const bookedAt: { code: string; term: number }[] = []
  for (const label of Object.keys(m.booked).sort()) {
    const t = parse(label)
    if (!t) continue
    let idx = indexOf.get(label)
    if (idx === undefined) {
      idx = -1
      for (let i = 0; i < terms.length; i++) if (order(terms[i]) <= order(t)) idx = i
    }
    for (const code of [...m.booked[label]].sort()) bookedAt.push({ code, term: order(t) < order(m.start) ? -1 : idx })
  }
  const bookedHere = (label: string) => (m.booked[label] ?? []).filter(() => true)
  const coreTerms: CoreTerm[] = terms.map((t, i) => {
    const label = labels[i]
    const here = parse(label) && order(t) >= order(m.start) ? bookedHere(label) : []
    const fw = t.season !== 'Spring/Summer'
    const load = fw ? m.load : m.summer
    const awayTerm = m.away !== null && academicYear(t) === m.away
    if (here.length > load) diagnostics.push({ level: 'warning', code: 'BOOKED_OVER_LOAD', term: label, message: `You're registered for ${here.length} courses in ${label}, more than your load of ${load}.` })
    const cap = awayTerm ? 0 : Math.max(0, load - here.length)
    const hereCu = here.reduce((n, c) => n + m.cuOf(c), 0)
    const seniorHere = here.filter((c) => subjectOf(c) === 'CMPT' && m.levelOf(c) >= 3).length
    return {
      label,
      season: t.season,
      cap,
      cuCap: fw ? Math.max(0, m.maxCu - hereCu) : 3 * cap,
      seniorCap: fw ? Math.max(0, m.maxSeniorCmpt - seniorHere) : 0,
    }
  })

  const byId = new Map(m.courses.map((c) => [c.id, c]))
  const dropped = new Map<string, Diagnostic>()
  const drop = (id: string, d: Diagnostic) => { if (!dropped.has(id)) dropped.set(id, d) }
  const allowedOf = new Map<string, number[]>()
  const minTerm = new Map<string, number>()
  const credits = new Map<string, CreditRule[]>()
  const groups = new Map<string, { opts: string[]; concurrent: boolean }[]>()

  for (const c of m.courses) {
    const shown = c.named ? spaced(c.id) : c.id
    let usable: Season[]
    if (!c.named) {
      usable = c.summerOk && summerOn ? ['Fall', 'Winter', 'Spring/Summer'] : ['Fall', 'Winter']
    } else {
      const info = m.catalog[c.id]
      const listed = info?.seasons ?? []
      if (info?.atRisk) diagnostics.push({ level: 'warning', code: 'AT_RISK', course: c.id, message: `${shown} hasn't run in the last three years; check it's still offered.` })
      if (listed.length === 0) {
        usable = ['Fall', 'Winter']
        diagnostics.push({ level: 'warning', code: 'UNKNOWN_OFFERING', course: c.id, message: `${shown}: offering unconfirmed, planned in Fall or Winter.` })
      } else {
        usable = listed.filter((s) => summerOn || s !== 'Spring/Summer')
        if (usable.length === 0) {
          drop(c.id, { level: 'error', code: 'SUMMER_ONLY', course: c.id, message: `${shown} runs only in Spring/Summer, and Spring/Summer is off.` })
          continue
        }
      }
      const rules = [...(info?.credit ?? [])]
      if (rules.some((r) => r.standing === 'honours') && !m.honours) {
        drop(c.id, { level: 'error', code: 'STANDING', course: c.id, message: `${shown} needs Honours standing.` })
        continue
      }
      credits.set(c.id, rules.filter((r) => !r.standing || r.cu > 0).map((r) => ({ cu: r.cu, ...(r.subjects ? { subjects: r.subjects } : {}), ...(r.level ? { level: r.level } : {}) })))
      // Prerequisite groups still to meet.
      const gs: { opts: string[]; concurrent: boolean }[] = []
      let from = 0
      const all = [...(info?.requires ?? []).map((o) => ({ o, conc: false })), ...(info?.concurrent ?? []).map((o) => ({ o, conc: true }))]
      for (const g of all) {
        if (g.o.length === 0 || g.o.some((x) => m.passed.has(x) || m.credited(x))) continue
        const bookedTerms = bookedAt.filter((b) => g.o.includes(b.code)).map((b) => b.term)
        if (bookedTerms.length > 0) {
          from = Math.max(from, Math.min(...bookedTerms) + (g.conc ? 0 : 1))
          continue
        }
        const opts = g.o.filter((x) => byId.has(x) && x !== c.id).sort()
        if (opts.length === 0) {
          if (m.ignoreMissing) continue
          drop(c.id, { level: 'error', code: 'PREREQ_UNREACHABLE', course: c.id, message: `${shown} needs ${g.o.map(spaced).join(' or ')}, which the plan can't include.` })
          break
        }
        gs.push({ opts, concurrent: g.conc })
      }
      if (dropped.has(c.id)) continue
      groups.set(c.id, gs)
      minTerm.set(c.id, from)
    }
    const blocked = new Set(m.blocked[c.id] ?? [])
    const from = minTerm.get(c.id) ?? 0
    const full = c.named && Boolean(m.catalog[c.id]?.fullYear)
    const allowed: number[] = []
    for (let i = from; i < terms.length; i++) {
      if (!usable.includes(seasons[i]) || coreTerms[i].cap <= 0 || blocked.has(labels[i])) continue
      if (full && (seasons[i] !== 'Fall' || i + 1 >= terms.length || coreTerms[i + 1].cap <= 0 || blocked.has(labels[i + 1]))) continue
      allowed.push(i)
    }
    if (allowed.length === 0) {
      drop(c.id, { level: 'error', code: 'NO_OFFERING', course: c.id, message: `${shown} has no term left that runs it.` })
      continue
    }
    allowedOf.set(c.id, allowed)
  }

  // Cycles and dropped prerequisites: whatever can't be reached leaves too.
  for (let changed = true; changed; ) {
    changed = false
    for (const c of m.courses) {
      if (dropped.has(c.id) || !c.named) continue
      const gs = groups.get(c.id) ?? []
      for (const g of gs) {
        const live = g.opts.filter((o) => !dropped.has(o))
        if (live.length === 0) {
          drop(c.id, { level: 'error', code: 'PREREQ_UNREACHABLE', course: c.id, message: `${spaced(c.id)} needs ${g.opts.map(spaced).join(' or ')}, which can't be placed.` })
          changed = true
          break
        }
      }
    }
  }
  // A cycle: a course that (transitively, over single-option groups) needs itself.
  {
    const state = new Map<string, number>()
    const inCycle = new Set<string>()
    const visit = (id: string, stack: string[]) => {
      if (state.get(id) === 2) return
      if (state.get(id) === 1) { for (const x of stack.slice(stack.indexOf(id))) inCycle.add(x); return }
      state.set(id, 1)
      for (const g of groups.get(id) ?? []) if (!g.concurrent && g.opts.length === 1 && !dropped.has(g.opts[0])) visit(g.opts[0], [...stack, id])
      state.set(id, 2)
    }
    for (const c of m.courses) if (c.named && !dropped.has(c.id)) visit(c.id, [])
    for (const id of [...inCycle].sort()) drop(id, { level: 'error', code: 'CYCLE', course: id, message: `${spaced(id)} is in a prerequisite cycle in the catalogue.` })
  }

  const items: CoreItem[] = []
  for (const c of m.courses) {
    if (dropped.has(c.id)) continue
    items.push({
      id: c.id,
      named: c.named,
      cu: c.cu,
      level: Math.min(4, Math.max(1, c.level)),
      seniorCmpt: c.seniorCmpt,
      fullYear: c.named && Boolean(m.catalog[c.id]?.fullYear),
      allowed: allowedOf.get(c.id) ?? [],
      pre: (groups.get(c.id) ?? []).map((g) => ({ opts: g.opts.filter((o) => !dropped.has(o)), concurrent: g.concurrent })),
      credit: credits.get(c.id) ?? [],
      year: c.year,
      group: c.group,
      subject: c.named ? subjectOf(c.id) : '',
      ...(c.loose ? { loose: true } : {}),
      ...(c.free ? { free: true } : {}),
    })
  }
  const bookedOut = bookedAt.map((b) => ({ code: b.code, term: b.term, cu: m.cuOf(b.code), level: m.levelOf(b.code), subject: subjectOf(b.code) }))
  const done = [...m.passed].sort().map((code) => ({ code, cu: m.cuOf(code), level: m.levelOf(code), subject: subjectOf(code) }))
  return {
    core: {
      items,
      terms: coreTerms,
      done,
      booked: bookedOut,
      ...(m.assumedCuPerTerm ? { assumedCuPerTerm: m.assumedCuPerTerm } : {}),
      ...(m.nodeBudget !== undefined ? { nodeBudget: m.nodeBudget } : {}),
      ...(m.namedCreditOnly ? { namedCreditOnly: true } : {}),
    },
    labels,
    seasons,
    dropped: [...dropped.keys()].sort(),
    diagnostics: [...diagnostics, ...[...dropped.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([, d]) => d)],
  }
}
