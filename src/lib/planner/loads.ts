// The one source of truth for load settings. Onboarding, Plan settings, What if, the cloud session
// and the planner all read these. A Spring/Summer load of 0 means no Spring/Summer term; the
// `springSummer` boolean survives only at the edges (SavedState, CloudSession, the DB) for
// compatibility, derived as summer > 0.

/** Courses a Fall/Winter term may hold. */
export const FW_LOADS = [1, 2, 3, 4, 5] as const
/** Courses a Spring/Summer term may hold; 0 = off. */
export const SUMMER_LOADS = [0, 1, 2] as const
export const MAX_FW_LOAD = 5
export const MAX_SUMMER_LOAD = 2
export const DEFAULT_FW_LOAD = 5
/** The default when a student turns Spring/Summer on. */
export const DEFAULT_SUMMER_LOAD = 2

/** Any stored or typed value → 1-5 (whole courses); junk → the default. */
export function clampLoad(n: unknown, fallback: number = DEFAULT_FW_LOAD): number {
  const v = typeof n === 'number' && Number.isFinite(n) ? Math.floor(n) : fallback
  return Math.min(MAX_FW_LOAD, Math.max(1, v))
}

/** Any stored or typed value → 0-2; a stored 3 (the old maximum) becomes 2; junk → 0 (off). */
export function clampSummer(n: unknown, fallback = 0): number {
  const v = typeof n === 'number' && Number.isFinite(n) ? Math.floor(n) : fallback
  return Math.min(MAX_SUMMER_LOAD, Math.max(0, v))
}

/** The effective Spring/Summer load from the edge fields: off → 0, on → the clamped count (at least 1). */
export function summerLoadOf(springSummer: boolean | undefined, summerPerTerm: number | undefined): number {
  if (!springSummer) return 0
  return Math.max(1, clampSummer(summerPerTerm ?? DEFAULT_SUMMER_LOAD, DEFAULT_SUMMER_LOAD))
}
