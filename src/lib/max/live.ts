// What the app and the server say to each other while Max is on a call: the plan inputs the app
// sends when it places the call (so Max plans exactly what's on screen), and the live events the
// server broadcasts as Max works (so the Skill Tree reshapes as Max talks). Shared by api/ and src/.
import type { PlannedTerm, Season, TermStart } from '../plan.js'

/** The app's plan, as inputs (App.tsx's buildStudentPlan call), sent with the call. */
export interface CallPlanInputs {
  v: 1
  programId: string
  completed: string[]
  /** What they're taking now (the app's inProgressCourses). */
  inProgress: string[]
  /** Each in-progress course's own season (the app's courseTerms). */
  inProgressSeasons: Record<string, Season>
  /** The app's targets in order: the hero first, then the extras (App.tsx `targets` before the remaining filter). */
  targetIds: string[]
  /** For display and the DB only — targetIds is what plans. */
  concentrationIds: string[]
  minorId: string | null
  degreeVariant: string | null
  /** The internship year the plan leaves empty (academic year, by its Fall's year). */
  away: number | null
  coursesPerTerm: number
  springSummer: boolean
  summerPerTerm: number
  start: TermStart
  /** "YYYY-MM-DD" — the app's today, so booked terms match. */
  today: string
  /** planHash() of the plan the app is showing, to check the server agrees. */
  planHash: string
  /** Server-kept after a save in the call: what they're enrolled in, and what the saved plan dropped. */
  enrolled?: string[]
  droppedCourses?: string[]
  /** Courses the student put in a term themselves (PlanOptions.pinned), and ones asked for in no term (added). */
  pinned?: Record<string, string[]>
  added?: string[]
  /** The app's internship answer, and the academic year each answer leaves empty (Max's SET_INTERNSHIP). */
  internship?: 3 | 4 | null
  internshipAYs?: Partial<Record<'3' | '4', number>>
  /** Server-kept: the inputs the call started with, so a guest's "undo" returns to their own plan. */
  original?: Omit<CallPlanInputs, 'original'>
}

/** A call's inputs as a scenario changes them: what the tree needs to redraw a frame. */
export interface LiveInputs {
  inProgress: string[]
  targetIds: string[]
  coursesPerTerm: number
  springSummer: boolean
  summerPerTerm: number
  droppedCourses: string[]
  /** Set by scenarios that can change them (missing on older ones): what the app adopts on a save. */
  programId?: string
  minorId?: string | null
  degreeVariant?: string | null
  pinned?: Record<string, string[]>
  added?: string[]
  internship?: 3 | 4 | null
}

/** One step of Max's proposal: the tree after one more change. */
export interface LiveFrame {
  caption: string
  terms: PlannedTerm[]
  inputs: LiveInputs
}

export interface LiveScenario {
  scenarioId: string
  status: 'presented' | 'committed' | 'discarded'
  presentedHash: string | null
  /** A program change (specialization switch) — saved only by the student's tap in the app (I2). */
  requiresAppConfirmation: boolean
  headline: string[]
  errors: string[]
  graduation: { before: string | null; after: string | null }
  frames: LiveFrame[]
}

export interface LiveOption {
  label: string
  graduation: string | null
  vsNow: string
  coursesLeft: number
}

export type LiveEvent =
  | { type: 'call.status'; seq: number; status: string; endedReason?: string | null }
  | { type: 'max.working'; seq: number; tool: string }
  | { type: 'scenario.presented'; seq: number; scenario: LiveScenario }
  | { type: 'scenario.committed'; seq: number; scenarioId: string; inputs: LiveInputs; terms: PlannedTerm[] }
  | { type: 'scenario.discarded'; seq: number; scenarioId: string }
  | { type: 'options.presented'; seq: number; about: string; options: LiveOption[]; recommended: string | null }
  | { type: 'app.action'; seq: number; action: AppAction }
  /** The student asked Max to call them something else: the app shows that name from now on. */
  | { type: 'profile.name'; seq: number; name: string }

/** Something Max does in the app itself, outside the plan: open a tab, or look a course up in the Class Tracker. */
export type AppAction = { kind: 'open_tab'; tab: 'overview' | 'plan' | 'awards' | 'classes' } | { kind: 'find_class'; courseCode: string }

/** GET /api/max/live — the whole state, for catching up on subscribe, reconnect and in polling mode. */
export interface LiveSnapshot {
  call: { callId: string; status: string; endedReason: string | null }
  /** Whether the server's plan from the app's inputs matched what the app showed. */
  parity: boolean
  baseline: { terms: PlannedTerm[]; inputs: LiveInputs } | null
  scenario: LiveScenario | null
  /** The call's last saved change (may be older than `scenario`): what the app must have adopted. */
  committed?: LiveScenario | null
  seq: number
}

export const liveTopic = (token: string) => `max-live:${token}`
