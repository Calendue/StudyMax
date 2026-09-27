// JSON shapes for BayMax's Json columns (docs/BayMax/spec/03-data-model.md). Reuses PlannedTerm /
// TermStart from lib/plan.ts rather than redefining them.
//
// Note: spec 03 asks for zod validation at every read/write of these. This weekend adds no new
// dependency for that (speed over ceremony, CLAUDE.md) — callers do a light shape check instead
// (see scenarios.ts's isSupportedOp) rather than a full runtime schema.

export type Term = { season: 'Fall' | 'Winter' | 'Spring/Summer'; year: number }

export type ScenarioOp =
  | { op: 'DROP_COURSE'; courseCode: string; term?: Term }
  | { op: 'ADD_COURSE'; courseCode: string; term?: Term }
  /** No toTerm: "later" — the next term after where it sits now that the plan can actually hold it. */
  | { op: 'MOVE_COURSE'; courseCode: string; toTerm?: Term }
  | { op: 'PIN_COURSE'; courseCode: string; term: Term }
  | { op: 'UNPIN_COURSE'; courseCode: string }
  | { op: 'SET_PREFERENCE'; key: string; value: unknown }
  | { op: 'SET_GRAD_TARGET'; term: Term }
  | { op: 'SET_MAJOR'; programId: string }
  | { op: 'SET_MINOR'; programId: string | null }
  | { op: 'SET_SPECIALIZATIONS'; specializationIds: string[] }
  /** 'previous': the version before the current one ("leave it as it was" right after a save). */
  | { op: 'RESTORE_VERSION'; versionNumber: number | 'previous' }
  | { op: 'SET_DEGREE'; variant: string }
  | { op: 'SET_INTERNSHIP'; year: 3 | 4 | null }

/** Ops with real planner support (docs/BayMax/implementation/03-planning-and-audit-adapter.md). ADD, MOVE
 * and PIN put a course in a term (PlanOptions.pinned); SET_GRAD_TARGET picks the lightest load that
 * finishes by then. */
export const SUPPORTED_OPS = new Set<ScenarioOp['op']>([
  'DROP_COURSE',
  'ADD_COURSE',
  'MOVE_COURSE',
  'PIN_COURSE',
  'UNPIN_COURSE',
  'RESTORE_VERSION',
  'SET_PREFERENCE',
  'SET_GRAD_TARGET',
  'SET_MAJOR',
  'SET_MINOR',
  'SET_SPECIALIZATIONS',
  'SET_DEGREE',
  'SET_INTERNSHIP',
])

/** The preferences SET_PREFERENCE may change, with the app's own bounds (src/lib/cloudSession.ts clamps). */
export const PREFERENCE_KEYS = {
  maxCoursesPerTerm: { kind: 'int', min: 1, max: 5 },
  springSummer: { kind: 'bool' },
  maxSummerCourses: { kind: 'int', min: 1, max: 3 },
} as const
export type PreferenceKey = keyof typeof PREFERENCE_KEYS

/** Ops that change the student's program. Saved on a clear spoken yes like any other change (the team's
 * call, 2026-09-27, over spec 06's tap-only rule); a tap on Keep this plan saves them too. */
export const PROGRAM_OPS = new Set<ScenarioOp['op']>(['SET_MAJOR', 'SET_MINOR', 'SET_SPECIALIZATIONS', 'SET_DEGREE'])

export type OpenThread = { kind: 'scenario' | 'question'; scenarioId?: string; text: string }
