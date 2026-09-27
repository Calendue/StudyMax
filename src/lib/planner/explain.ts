// Diagnostics wording and the replan diff. Pure.
import type { PlannedCourse, PlannedTerm } from '../plan.js'
import type { CourseOverride } from '../overrides.js'
import { defaultCatalog } from '../catalog.js'
import type { Catalog, CoreResult, PlanDiff } from './types.js'

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
const spaced = (code: string) => code.replace(/^([A-Z]+)(\d)/, '$1 $2')
const isSlot = (code: string) => code.startsWith('elective:')
const slotLabel = (code: string) => code.split(':').slice(2).join(':')

/** Term label → a Fall/Winter step count (a Spring/Summer term counts with the Winter before it). */
function step(label: string | null): number | null {
  const m = label?.match(/^(Fall|Winter|Spring\/Summer) (\d{4})$/)
  if (!m) return null
  const year = Number(m[2])
  return m[1] === 'Fall' ? year * 2 + 1 : year * 2
}

/** One override in a student's words: "CMPT 317 not running Winter 2029". */
export function overrideText(o: CourseOverride): string {
  const c = spaced(o.code)
  switch (o.kind) {
    case 'failed':
      return `${c} not passed in ${o.term}`
    case 'withdrew':
      return `withdrew from ${c} in ${o.term}`
    case 'not-offered':
      return `${c} not running ${o.term}`
    case 'later':
      return `${c} pushed past ${o.term}`
  }
}

/**
 * What changed between two plans, for the "What changed" list. Elective slots are compared by label
 * per term (their codes renumber), named courses by code. Each entry's cause is traced back to the
 * overrides where it can be: the course's own override, else one on a prerequisite it waits on.
 */
export function diffPlans(before: PlannedTerm[], after: PlannedTerm[], overrides: readonly CourseOverride[] = [], catalog: Catalog = defaultCatalog()): PlanDiff {
  const sorted = [...overrides].sort((a, b) => cmp(a.term, b.term) || cmp(a.kind, b.kind) || cmp(a.code, b.code))
  const own = new Map<string, CourseOverride>()
  for (const o of sorted) if (!own.has(o.code)) own.set(o.code, o)
  const fallback = sorted.length > 0 ? `the plan made room after ${overrideText(sorted[0])}` : ''
  // A course's cause: its own override, or the nearest prerequisite (catalogue graph) that has one.
  const causeOf = (code: string): string => {
    if (own.has(code)) return overrideText(own.get(code)!)
    const seen = new Set([code])
    let frontier = [code]
    for (let depth = 0; depth < 8 && frontier.length > 0; depth++) {
      const next: string[] = []
      for (const c of frontier) {
        const info = catalog[c]
        for (const g of [...(info?.requires ?? []), ...(info?.concurrent ?? [])]) {
          for (const p of [...g].sort()) {
            if (own.has(p)) return `waits on ${spaced(p)}: ${overrideText(own.get(p)!)}`
            if (!seen.has(p)) { seen.add(p); next.push(p) }
          }
        }
      }
      frontier = next
    }
    return fallback
  }

  const named = (plan: PlannedTerm[]) => {
    const m = new Map<string, { term: string; course: PlannedCourse }>()
    for (const t of plan) for (const c of t.courses) if (!isSlot(c.code)) m.set(c.code, { term: t.label, course: c })
    return m
  }
  const a = named(before)
  const b = named(after)
  const moved: PlanDiff['moved'] = []
  const added: PlanDiff['added'] = []
  const removed: PlanDiff['removed'] = []
  const swapped: PlanDiff['swapped'] = []

  const gone = [...a.keys()].filter((c) => !b.has(c)).sort()
  const fresh = [...b.keys()].filter((c) => !a.has(c)).sort()
  // An alternative taking over the same requirement: a swap, not a removal and an addition.
  const pairedFresh = new Set<string>()
  for (const code of gone) {
    const group = a.get(code)!.course.group
    const into = group ? fresh.find((f) => !pairedFresh.has(f) && b.get(f)!.course.group === group) : undefined
    if (into) {
      pairedFresh.add(into)
      swapped.push({ group: group!, from: code, to: into, cause: causeOf(code) })
    } else removed.push({ course: code, from: a.get(code)!.term, cause: causeOf(code) })
  }
  const failedKinds = new Set(['failed', 'withdrew'])
  for (const code of fresh) {
    const x = b.get(code)!
    const why: PlanDiff['added'][number]['why'] = own.has(code) && failedKinds.has(own.get(code)!.kind)
      ? 'retake'
      : pairedFresh.has(code)
        ? 'alternative'
        : x.course.reason === 'prerequisite'
          ? 'prerequisite'
          : 'requirement'
    added.push({ course: code, to: x.term, why, cause: causeOf(code) })
  }
  for (const code of [...a.keys()].filter((c) => b.has(c)).sort()) {
    const from = a.get(code)!.term
    const to = b.get(code)!.term
    if (from !== to) moved.push({ course: code, from, to, cause: causeOf(code) })
  }

  // Elective slots: by label, as a multiset of terms, paired in term order.
  const slots = (plan: PlannedTerm[]) => {
    const m = new Map<string, string[]>()
    for (const t of plan) for (const c of t.courses) if (isSlot(c.code)) m.set(slotLabel(c.code), [...(m.get(slotLabel(c.code)) ?? []), t.label])
    for (const v of m.values()) v.sort((x, y) => (step(x) ?? 0) - (step(y) ?? 0) || cmp(x, y))
    return m
  }
  const sa = slots(before)
  const sb = slots(after)
  for (const label of [...new Set([...sa.keys(), ...sb.keys()])].sort()) {
    const x = sa.get(label) ?? []
    const y = sb.get(label) ?? []
    const n = Math.min(x.length, y.length)
    for (let i = 0; i < n; i++) if (x[i] !== y[i]) moved.push({ course: label, from: x[i], to: y[i], cause: fallback })
    for (let i = n; i < x.length; i++) removed.push({ course: label, from: x[i], cause: fallback })
    for (let i = n; i < y.length; i++) added.push({ course: label, to: y[i], why: 'elective', cause: fallback })
  }

  const last = (p: PlannedTerm[]) => p.filter((t) => t.courses.length > 0).at(-1)?.label ?? null
  const from = last(before)
  const to = last(after)
  const sf = step(from)
  const st = step(to)
  return { moved, added, removed, swapped, graduation: { from, to, terms: sf !== null && st !== null ? st - sf : 0 } }
}

/** "Graduation set by MATH 116 → STAT 241 → …", "set by 4 Winter-only courses", "set by your load of 3 a term". */
export function bindingText(b: CoreResult['binding'], load: number, count: number): string {
  const name = (id: string) => (isSlot(id) ? slotLabel(id) : spaced(id))
  switch (b.kind) {
    case 'chain':
      return b.chain && b.chain.length > 1 ? `Graduation set by ${b.chain.map(name).join(' → ')}` : `Graduation set by ${b.chain?.[0] ? name(b.chain[0]) : 'a prerequisite chain'}`
    case 'gate':
      return `Graduation set by the credit you need before ${b.chain?.[0] ? name(b.chain[0]) : 'senior courses'}`
    case 'capacity':
      return `Graduation set by your load of ${load} a term (${count} courses left)`
    case 'season':
      return `Graduation set by ${b.detail}`
    case 'senior':
      return `Graduation set by ${b.detail} at three a term`
    default:
      return ''
  }
}
