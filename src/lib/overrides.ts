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

import type { Catalog, Diagnostic } from './planner/types.js'

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
  // STUB (Stage A contract): the Overrides track replaces this body. Blocks only.
  void catalog
  void currentTerm
  const blocked: Record<string, string[]> = {}
  for (const o of overrides) if (o.kind === 'not-offered' || o.kind === 'later') (blocked[o.code] ??= []).push(o.term)
  return {
    completed: new Set(input.completed),
    inProgress: [...input.inProgress],
    booked: Object.fromEntries(Object.entries(input.booked).map(([k, v]) => [k, [...v]])),
    blocked,
    retakes: [],
    valid: [...overrides],
    notes: [],
  }
}
