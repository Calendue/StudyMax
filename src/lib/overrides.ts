// "Life happened": a course failed, withdrawn, not running when the student got there, or pushed
// later. Overrides are plain data (device-only, in SavedState) applied as a pure pre-pass before
// planning; replanning is the same pure function on the updated inputs, with no incremental state.
//
// Semantics (applyOverrides):
// - failed / withdrew in term T (the current term or a past one): the course leaves completed, in
//   progress and booked; it comes back as a retake if the degree or a target still needs it.
//   Transitively, any booked or in-progress course that depended ONLY on it (no other option of that
//   prerequisite group is completed or still under way) is un-booked too, with a note: "You're
//   registered for CMPT 434 in Winter 2027 but it needs CMPT 332; the plan moves it. Check with the
//   department."
// - not-offered / later in term T (the current term or a future one): (code, T) is blocked, and a
//   booking of it in T is removed. The course moves to the next term that really runs it, or an
//   alternative takes over through L2 selection. The two kinds differ only in their copy.
// - Terms before the next term the student can register for are frozen history.
// - Validation: the code must be in the catalogue; failed/withdrew only for the current or a past
//   term; not-offered/later only for the current or a future term. Invalid ones are dropped with an
//   OVERRIDE_INVALID note.
// - Order: sorted by term, then kind, then code, de-duplicated on (code, kind, term). For
//   failed/withdrew the latest term wins; not-offered/later accumulate.
// 'dropped' is spelled 'withdrew'.
//
// Implementation notes (the cascade): a booked or in-progress course sits in its booked term, or the
// current term when it has none. One of its prerequisite groups (catalog `requires`, earlier term;
// `concurrent`, same term or earlier) breaks only when it names a course this pass removed and no
// option is still completed or booked in time. A group that was never met in the data (a transfer
// credit the codes don't show) never un-books anything. Repeated until nothing changes.

import type { Catalog, Diagnostic, DiagnosticCode } from './planner/types.js'

export type OverrideKind = 'failed' | 'withdrew' | 'not-offered' | 'later'

export interface CourseOverride {
  code: string
  /** An exact plan term label: "Winter 2027". */
  term: string
  kind: OverrideKind
}

export interface OverrideInput {
  completed: ReadonlySet<string>
  inProgress: readonly string[]
  /** Booked courses by term label. */
  booked: Readonly<Record<string, readonly string[]>>
}

export interface AppliedOverrides {
  completed: Set<string>
  inProgress: string[]
  booked: Record<string, string[]>
  /** Terms each course may not be placed in, by code. */
  blocked: Record<string, string[]>
  /** Courses taken again because a failed/withdrawn attempt no longer counts. */
  retakes: string[]
  /** The overrides that applied, in canonical order. */
  valid: CourseOverride[]
  /** RETAKE, UNBOOKED, BLOCKED and OVERRIDE_INVALID notes, in canonical order. */
  notes: Diagnostic[]
}

const KINDS: readonly OverrideKind[] = ['failed', 'withdrew', 'not-offered', 'later']
const KIND_RANK: Record<OverrideKind, number> = { failed: 0, withdrew: 1, 'not-offered': 2, later: 3 }
const SEASON_RANK: Record<string, number> = { Winter: 0, 'Spring/Summer': 1, Fall: 2 }
const TERM_RE = /^(Fall|Winter|Spring\/Summer) (\d{4})$/
const NOTE_RANK: Partial<Record<DiagnosticCode, number>> = { RETAKE: 0, BLOCKED: 1, UNBOOKED: 2, OVERRIDE_INVALID: 3 }

/** "Winter 2027" → a sortable number (Winter < Spring/Summer < Fall within a year); NaN if malformed. */
export function termOrd(label: string): number {
  const m = TERM_RE.exec(label)
  return m ? Number(m[2]) * 3 + SEASON_RANK[m[1]] : Number.NaN
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
/** A term's sort key with malformed or missing terms last (finite, so comparators never see NaN). */
const ordKey = (label: string | undefined) => {
  const t = label === undefined ? Number.NaN : termOrd(label)
  return Number.isNaN(t) ? 1e9 : t
}
/** "CMPT332" → "CMPT 332". */
const spaced = (code: string) => code.replace(/^([A-Z]+)(\d)/, '$1 $2')
const list = (codes: readonly string[]) =>
  codes.length <= 1 ? codes.map(spaced).join('') : `${codes.slice(0, -1).map(spaced).join(', ')} or ${spaced(codes[codes.length - 1])}`

/** Canonical order: term, then kind, then code (plain `<`), de-duplicated on (code, kind, term). */
export function sortOverrides(overrides: readonly CourseOverride[]): CourseOverride[] {
  const seen = new Set<string>()
  const out: CourseOverride[] = []
  for (const o of overrides) {
    const key = `${o.code}|${o.kind}|${o.term}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ code: o.code, term: o.term, kind: o.kind })
  }
  return out.sort(
    (a, b) =>
      ordKey(a.term) - ordKey(b.term) ||
      cmp(String(a.term), String(b.term)) ||
      (KIND_RANK[a.kind] ?? 9) - (KIND_RANK[b.kind] ?? 9) ||
      cmp(String(a.code), String(b.code)),
  )
}

/** The label a student sees on an override: "Failed · Fall 2026", "Not running Winter 2028". */
export function overrideLabel(kind: OverrideKind, term: string): string {
  switch (kind) {
    case 'failed':
      return `Failed · ${term}`
    case 'withdrew':
      return `Withdrew · ${term}`
    case 'not-offered':
      return `Not running ${term}`
    case 'later':
      return `Taking it later than ${term}`
  }
}

/** The short cause a replan diff shows beside a moved course: "you failed it". */
export function overrideCause(kind: OverrideKind): string {
  switch (kind) {
    case 'failed':
      return 'you failed it'
    case 'withdrew':
      return 'you withdrew'
    case 'not-offered':
      return "it isn't running then"
    case 'later':
      return "you're taking it later"
  }
}

/** Two overrides are the same one (for undo). */
export function sameOverride(a: CourseOverride, b: CourseOverride): boolean {
  return a.code === b.code && a.kind === b.kind && a.term === b.term
}

function invalidReason(o: CourseOverride, catalog: Catalog, current: number): string | null {
  if (!KINDS.includes(o.kind)) return `An unknown change for ${spaced(String(o.code))} was ignored.`
  if (typeof o.code !== 'string' || !Object.prototype.hasOwnProperty.call(catalog, o.code))
    return `${spaced(String(o.code))} isn't in the course catalogue, so that change was ignored.`
  const t = termOrd(o.term)
  if (Number.isNaN(t)) return `"${o.term}" isn't a term, so the change to ${spaced(o.code)} was ignored.`
  if ((o.kind === 'failed' || o.kind === 'withdrew') && t > current)
    return `${spaced(o.code)} can't be marked ${o.kind === 'failed' ? 'failed' : 'withdrawn'} in ${o.term}, which hasn't happened yet; that change was ignored.`
  if ((o.kind === 'not-offered' || o.kind === 'later') && t < current)
    return `${o.term} is already over, so the change to ${spaced(o.code)} was ignored.`
  return null
}

/**
 * Applies overrides to the student's state. Pure and deterministic.
 * @param currentTerm the term being sat now ("Fall 2026").
 */
export function applyOverrides(
  input: OverrideInput,
  overrides: readonly CourseOverride[],
  catalog: Catalog,
  currentTerm: string,
): AppliedOverrides {
  const current = termOrd(currentTerm)
  const notes: Diagnostic[] = []

  // Validate, then canonical order; failed/withdrew keep only the latest term per course.
  const ok: CourseOverride[] = []
  for (const o of sortOverrides(overrides)) {
    const why = invalidReason(o, catalog, Number.isNaN(current) ? Infinity : current)
    if (why) notes.push({ level: 'warning', code: 'OVERRIDE_INVALID', course: typeof o.code === 'string' ? o.code : undefined, term: o.term, message: why })
    else ok.push(o)
  }
  const latestStatus = new Map<string, CourseOverride>()
  for (const o of ok) if (o.kind === 'failed' || o.kind === 'withdrew') latestStatus.set(o.code, o) // sorted: the last is the latest
  const valid = ok.filter((o) => (o.kind === 'failed' || o.kind === 'withdrew' ? latestStatus.get(o.code) === o : true))

  const completed = new Set(input.completed)
  const inProgress = [...input.inProgress]
  const booked: Record<string, string[]> = {}
  for (const label of Object.keys(input.booked).sort()) booked[label] = [...input.booked[label]]
  const blocked: Record<string, string[]> = {}
  const retakes: string[] = []
  const removed = new Set<string>()

  const unbook = (code: string, term?: string) => {
    let hit = false
    for (const label of Object.keys(booked)) {
      if (term !== undefined && label !== term) continue
      const at = booked[label].indexOf(code)
      if (at >= 0) {
        booked[label].splice(at, 1)
        hit = true
      }
    }
    return hit
  }
  const bookedTermOf = (code: string): string | null => {
    let best: string | null = null
    for (const label of Object.keys(booked)) if (booked[label].includes(code) && (best === null || termOrd(label) < termOrd(best))) best = label
    return best
  }

  for (const o of valid) {
    if (o.kind === 'failed' || o.kind === 'withdrew') {
      let hit = completed.delete(o.code)
      const at = inProgress.indexOf(o.code)
      if (at >= 0) {
        inProgress.splice(at, 1)
        hit = true
      }
      if (unbook(o.code)) hit = true
      removed.add(o.code)
      if (hit) {
        retakes.push(o.code)
        notes.push({
          level: 'info',
          code: 'RETAKE',
          course: o.code,
          term: o.term,
          message:
            o.kind === 'failed'
              ? `You failed ${spaced(o.code)} in ${o.term}; the plan takes it again if you still need it.`
              : `You withdrew from ${spaced(o.code)} in ${o.term}; the plan takes it again if you still need it.`,
        })
      }
    } else {
      const terms = (blocked[o.code] ??= [])
      if (!terms.includes(o.term)) terms.push(o.term)
      let hit = unbook(o.code, o.term)
      // An in-progress course with no booked term sits in the current term.
      const at = inProgress.indexOf(o.code)
      if (at >= 0 && (hit || (termOrd(o.term) === current && bookedTermOf(o.code) === null))) {
        inProgress.splice(at, 1)
        hit = true
      }
      if (hit) removed.add(o.code)
      notes.push({
        level: 'info',
        code: 'BLOCKED',
        course: o.code,
        term: o.term,
        message:
          o.kind === 'not-offered'
            ? `${spaced(o.code)} isn't running in ${o.term}${hit ? ', so your registration there is dropped' : ''}; the plan places it in another term.`
            : `You're taking ${spaced(o.code)} later than ${o.term}${hit ? ', so your registration there is dropped' : ''}; the plan places it after that.`,
      })
    }
  }
  for (const code of Object.keys(blocked)) blocked[code].sort((a, b) => ordKey(a) - ordKey(b))

  // The cascade: un-book what now depends only on removed courses, until nothing changes.
  const termOfUnderWay = (code: string) => bookedTermOf(code) ?? currentTerm
  let changed = removed.size > 0
  while (changed) {
    changed = false
    const underWay = [...new Set([...inProgress, ...Object.values(booked).flat()])]
      .map((code) => ({ code, term: termOfUnderWay(code) }))
      .sort((a, b) => ordKey(a.term) - ordKey(b.term) || cmp(a.code, b.code))
    for (const { code, term } of underWay) {
      const info = catalog[code]
      if (!info) continue
      const t = termOrd(term)
      const metBy = (opt: string, concurrent: boolean) => {
        if (completed.has(opt)) return true
        if (!inProgress.includes(opt) && bookedTermOf(opt) === null) return false
        const at = termOrd(termOfUnderWay(opt))
        return concurrent ? at <= t : at < t
      }
      const broken = [
        ...info.requires.map((g) => ({ g, concurrent: false })),
        ...info.concurrent.map((g) => ({ g, concurrent: true })),
      ].find(({ g, concurrent }) => g.some((opt) => removed.has(opt)) && !g.some((opt) => metBy(opt, concurrent)))
      if (!broken) continue
      unbook(code)
      const at = inProgress.indexOf(code)
      if (at >= 0) inProgress.splice(at, 1)
      removed.add(code)
      const needs = broken.g.filter((opt) => removed.has(opt)).sort(cmp)
      notes.push({
        level: 'warning',
        code: 'UNBOOKED',
        course: code,
        term,
        message: `You're registered for ${spaced(code)} in ${term} but it needs ${list(needs)}; the plan moves it. Check with the department.`,
      })
      changed = true
      break // recompute terms after every un-booking, so the result doesn't depend on visit order
    }
  }
  for (const label of Object.keys(booked)) if (booked[label].length === 0) delete booked[label]

  notes.sort(
    (a, b) =>
      ordKey(a.term) - ordKey(b.term) ||
      (NOTE_RANK[a.code] ?? 9) - (NOTE_RANK[b.code] ?? 9) ||
      cmp(a.course ?? '', b.course ?? '') ||
      cmp(a.message, b.message),
  )

  return { completed, inProgress, booked, blocked, retakes: [...new Set(retakes)].sort(cmp), valid, notes }
}
