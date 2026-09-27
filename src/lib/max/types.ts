// JSON shapes for BayMax's Json columns (docs/BayMax/spec/03-data-model.md). Reuses PlannedTerm /
// TermStart from lib/plan.ts rather than redefining them.
//
// Note: spec 03 asks for zod validation at every read/write of these. This weekend adds no new
// dependency for that (speed over ceremony, CLAUDE.md) — callers do a light shape check instead
// (see scenarios.ts's isSupportedOp) rather than a full runtime schema.

export type Term = { season: 'Fall' | 'Winter'; year: number }

export type ScenarioOp =
  | { op: 'DROP_COURSE'; courseCode: string; term?: Term }
  | { op: 'ADD_COURSE'; courseCode: string; term?: Term }
  | { op: 'MOVE_COURSE'; courseCode: string; toTerm: Term }
  | { op: 'PIN_COURSE'; courseCode: string; term: Term }
  | { op: 'UNPIN_COURSE'; courseCode: string }
  | { op: 'SET_PREFERENCE'; key: string; value: unknown }
  | { op: 'SET_GRAD_TARGET'; term: Term }
  | { op: 'SET_MAJOR'; programId: string }
  | { op: 'SET_MINOR'; programId: string | null }
  | { op: 'SET_SPECIALIZATIONS'; specializationIds: string[] }
  | { op: 'RESTORE_VERSION'; versionNumber: number }

/** Ops with real planner support this weekend (docs/BayMax/implementation/03-planning-and-audit-adapter.md). */
export const SUPPORTED_OPS = new Set<ScenarioOp['op']>(['DROP_COURSE', 'RESTORE_VERSION'])

/** Ops that can never be committed over voice (I2) — need an in-app tap (spec 06). */
export const PROGRAM_OPS = new Set<ScenarioOp['op']>(['SET_MAJOR', 'SET_MINOR', 'SET_SPECIALIZATIONS'])

export type OpenThread = { kind: 'scenario' | 'question'; scenarioId?: string; text: string }
