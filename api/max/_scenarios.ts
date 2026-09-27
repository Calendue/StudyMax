// Scenario lifecycle and server-checked commits (docs/BayMax/spec/06-scenarios-and-commits.md,
// docs/BayMax/implementation/04-scenarios-and-commits.md). This is the enforcement point for I2:
// the LLM can create and present scenarios freely, but only the server decides whether a commit is
// allowed.
//
// Lives under api/, not src/lib/max/ (where the implementation doc originally put it): it needs
// @prisma/client and node:crypto, and src/ compiles under tsconfig.app.json (bundler resolution, no
// Node types — it's the browser build). src/lib/max/planningAdapter.ts stays under src/ because it's
// genuinely pure (no DB, no Node builtins); this module is the one that actually touches the database.
import { createHash } from 'node:crypto'
import { Prisma, type GeneratedPlan } from '@prisma/client'
import { db } from '../_db.js'
import { planVersionWrites, type PlanSnapshot } from '../_planVersion.js'
import { diff, regenerate, validate, type RoadmapDiff, type ValidationResult } from '../../src/lib/max/planningAdapter.js'
import { PROGRAM_OPS, SUPPORTED_OPS, type ScenarioOp, type Term } from '../../src/lib/max/types.js'
import type { PlannedTerm } from '../../src/lib/plan.js'

const SCENARIO_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days (spec 06's "expired" state)

export type ToolError = { ok: false; code: string; speakable: string }

function err(code: string, speakable: string): ToolError {
  return { ok: false, code, speakable }
}

// --- planner-input snapshot: the current official state, and what an op list does to it ---

interface Snapshot {
  completed: string[]
  inProgress: string[]
  targetProgramId: string
  minorProgramId: string | null
  targetSpecializationIds: string[]
  coursesPerTerm: number
  start: Term
  /** StudentProfile.internshipAcademicYear: the academic year the plan leaves empty. */
  away: number | null
}

async function loadCurrentSnapshot(userId: bigint): Promise<{ plan: GeneratedPlan; snapshot: Snapshot } | null> {
  const [plan, courses, profile] = await Promise.all([
    db().generatedPlan.findUnique({ where: { userId } }),
    db().studentCourse.findMany({ where: { userId } }),
    db().studentProfile.findUnique({ where: { userId }, select: { internshipAcademicYear: true } }),
  ])
  if (!plan) return null
  return {
    plan,
    snapshot: {
      completed: courses.filter((c) => c.status === 'completed').map((c) => c.courseCode),
      inProgress: courses.filter((c) => c.status === 'in_progress').map((c) => c.courseCode),
      targetProgramId: plan.targetProgramId,
      minorProgramId: null,
      targetSpecializationIds: plan.targetSpecializationIds,
      coursesPerTerm: plan.coursesPerTerm,
      start: { season: plan.startSeason as Term['season'], year: plan.startYear },
      // Not a scenario op: a what-if keeps the student's internship year, so the diff never shows one.
      away: profile?.internshipAcademicYear ?? null,
    },
  }
}

/** Applies validated ops to a snapshot. RESTORE_VERSION must be the only op (checked on append). */
async function applyOps(planId: bigint, base: Snapshot, ops: ScenarioOp[]): Promise<Snapshot | ToolError> {
  const restore = ops.find((o) => o.op === 'RESTORE_VERSION')
  if (restore && restore.op === 'RESTORE_VERSION') {
    const version = await db().planVersion.findUnique({ where: { planId_versionNumber: { planId, versionNumber: restore.versionNumber } } })
    if (!version) return err('UNKNOWN_VERSION', `I don't have a version ${restore.versionNumber} to go back to.`)
    return {
      ...base, // completed/inProgress stay current — restore rewinds plan targets, not course history
      targetProgramId: version.targetProgramId,
      minorProgramId: version.minorProgramId,
      targetSpecializationIds: version.targetSpecializationIds,
      coursesPerTerm: version.coursesPerTerm,
      start: { season: version.startSeason as Term['season'], year: version.startYear },
    }
  }

  let inProgress = new Set(base.inProgress)
  for (const op of ops) {
    if (op.op === 'DROP_COURSE') {
      if (!inProgress.has(op.courseCode)) {
        return err('COURSE_NOT_IN_PROGRESS', `I don't have ${op.courseCode} listed as something you're currently taking.`)
      }
      inProgress = new Set(inProgress)
      inProgress.delete(op.courseCode)
    }
  }
  return { ...base, inProgress: [...inProgress] }
}

// --- run_scenario pipeline ---

export interface ScenarioResult {
  scenarioId: bigint
  status: string
  operations: ScenarioOp[]
  resultTerms: PlannedTerm[]
  diff: RoadmapDiff
  validation: ValidationResult
  baseVersion: number
}

/**
 * Loads or creates a Scenario row, appends `ops`, recomputes (regenerate -> validate -> diff), and
 * writes the result back with status "computed". Does not mark it "presented" — the tool gateway
 * does that at return time (spec 07: "the tool result is exactly what Max will speak").
 */
export async function runScenario(
  userId: bigint,
  ops: ScenarioOp[],
  opts: { scenarioId?: bigint; callId?: bigint } = {},
): Promise<ScenarioResult | ToolError> {
  for (const op of ops) {
    if (!SUPPORTED_OPS.has(op.op)) {
      return err('UNSUPPORTED_OPERATION', "I can't make that kind of change yet — try dropping or restoring a course instead.")
    }
  }
  if (ops.some((o) => o.op === 'RESTORE_VERSION') && ops.length > 1) {
    return err('UNSUPPORTED_OPERATION', 'Restoring an old version has to be the only change in that request.')
  }

  const current = await loadCurrentSnapshot(userId)
  if (!current) return err('NO_PLAN', "I don't have a roadmap on file for you yet.")
  const { plan, snapshot: baseSnapshot } = current

  const scenario = opts.scenarioId ? await db().scenario.findUnique({ where: { scenarioId: opts.scenarioId } }) : null
  if (opts.scenarioId && (!scenario || scenario.userId !== userId)) {
    return err('UNKNOWN_SCENARIO', "I've lost track of that plan change — let's start a new one.")
  }
  if (scenario && !['draft', 'computed', 'presented'].includes(scenario.status)) {
    return err('SCENARIO_CLOSED', "That plan change isn't open anymore — let's start a new one.")
  }

  const priorOps = (scenario?.operations as unknown as ScenarioOp[]) ?? []
  const allOps = [...priorOps, ...ops]

  const applied = await applyOps(plan.planId, baseSnapshot, allOps)
  if ('code' in applied) return applied

  const { terms } = regenerate({
    completed: new Set(applied.completed),
    inProgress: new Set(applied.inProgress),
    targetProgramId: applied.targetProgramId,
    targetSpecializationIds: applied.targetSpecializationIds,
    coursesPerTerm: applied.coursesPerTerm,
    start: applied.start,
    away: applied.away,
  })
  const validation = validate(terms)
  const roadmapDiff = diff(plan.terms as unknown as PlannedTerm[], terms)

  const resultInputs = {
    targetProgramId: applied.targetProgramId,
    minorProgramId: applied.minorProgramId,
    targetSpecializationIds: applied.targetSpecializationIds,
    coursesPerTerm: applied.coursesPerTerm,
    startSeason: applied.start.season,
    startYear: applied.start.year,
  }

  const data = {
    userId,
    baseVersion: plan.version,
    operations: allOps as unknown as Prisma.InputJsonValue,
    resultInputs: resultInputs as unknown as Prisma.InputJsonValue,
    resultTerms: terms as unknown as Prisma.InputJsonValue,
    diff: roadmapDiff as unknown as Prisma.InputJsonValue,
    validation: validation as unknown as Prisma.InputJsonValue,
    status: 'computed',
    // Any new op invalidates a prior presentation — "yes" must bind to what was actually said (I2).
    presentedHash: null,
    presentedAt: null,
    presentedVia: null,
    origin: 'voice',
    callId: opts.callId ?? scenario?.callId ?? null,
    expiresAt: new Date(Date.now() + SCENARIO_TTL_MS),
  }

  const row = scenario
    ? await db().scenario.update({ where: { scenarioId: scenario.scenarioId }, data })
    : await db().scenario.create({ data })

  return {
    scenarioId: row.scenarioId,
    status: row.status,
    operations: allOps,
    resultTerms: terms,
    diff: roadmapDiff,
    validation,
    baseVersion: row.baseVersion,
  }
}

// --- present / discard ---

function computePresentedHash(resultTerms: unknown, headline: string[], issues: unknown): string {
  return createHash('sha256').update(JSON.stringify({ resultTerms, headline, issues })).digest('hex')
}

/** Marks a computed scenario "presented" and returns its (stable) presentedHash. */
export async function presentScenario(userId: bigint, scenarioId: bigint, via: 'voice' | 'app' = 'voice') {
  const scenario = await db().scenario.findUnique({ where: { scenarioId } })
  if (!scenario || scenario.userId !== userId) return err('UNKNOWN_SCENARIO', "I've lost track of that plan change.")
  if (!['computed', 'presented'].includes(scenario.status)) {
    return err('SCENARIO_CLOSED', "That plan change isn't open anymore.")
  }
  const roadmapDiff = scenario.diff as unknown as RoadmapDiff
  const validation = scenario.validation as unknown as ValidationResult
  const presentedHash = computePresentedHash(scenario.resultTerms, roadmapDiff.headline, validation.issues)
  const row = await db().scenario.update({
    where: { scenarioId },
    data: { status: 'presented', presentedHash, presentedAt: new Date(), presentedVia: via },
  })
  return { scenarioId: row.scenarioId, presentedHash }
}

export async function discardScenario(userId: bigint, scenarioId: bigint) {
  const scenario = await db().scenario.findUnique({ where: { scenarioId } })
  if (!scenario || scenario.userId !== userId) return err('UNKNOWN_SCENARIO', "I've lost track of that plan change.")
  await db().scenario.update({ where: { scenarioId }, data: { status: 'discarded' } })
  return { ok: true as const }
}

// --- voice affirmative check (spec 06) — a small keyword classifier, not a model call ---

const AFFIRMATIVE_RE = /^\s*(yes|yeah|yep|sure|go ahead|do it|confirm|save it)\b/i
const HEDGE_RE = /\b(maybe|guess|but|and also)\b/i
const NEGATION_RE = /\b(no|don't|not)\b/i

export type AffirmativeCheck = { ok: true } | { ok: false; reason: 'question' | 'hedge' | 'negation' | 'no_match' }

export function checkAffirmative(utterance: string): AffirmativeCheck {
  const text = utterance.trim()
  if (text.includes('?')) return { ok: false, reason: 'question' }
  if (NEGATION_RE.test(text)) return { ok: false, reason: 'negation' }
  if (HEDGE_RE.test(text)) return { ok: false, reason: 'hedge' }
  if (AFFIRMATIVE_RE.test(text)) return { ok: true }
  return { ok: false, reason: 'no_match' }
}

// commitPlanVersion (the one write path to GeneratedPlan, spec 03) lives in ../_planVersion.ts —
// shared with api/session.ts, which uses the same helper to keep a real signed-in student's plan
// current on every onboarding save.
type CommitSnapshot = PlanSnapshot

// --- commit_scenario ---

export interface CommitConfirmation {
  channel: 'voice' | 'app'
  utterance?: string
  callId?: bigint
}

export interface CommitSuccess {
  ok: true
  versionId: string
  undoAvailable: boolean
}

/** Implements spec 06's commit check order in full, including the dead-this-weekend tier check (I2). */
export async function commitScenario(
  userId: bigint,
  scenarioId: bigint,
  presentedHash: string,
  confirmation: CommitConfirmation,
): Promise<CommitSuccess | ToolError> {
  const scenario = await db().scenario.findUnique({ where: { scenarioId } })
  if (!scenario || scenario.userId !== userId) return err('UNKNOWN_SCENARIO', "I've lost track of that plan change — let's start over.")

  // Accept "presented" (normal path) or "committed" with the SAME hash (a retried commit) — the
  // unique constraint on PlanVersion.scenarioId is the actual idempotency guarantee below.
  const alreadyCommitted = scenario.status === 'committed'
  if (!alreadyCommitted && scenario.status !== 'presented') {
    return err('NOT_PRESENTED', "I haven't told you what that change does yet — let me walk through it first.")
  }
  if (scenario.presentedHash !== presentedHash) {
    return err('STALE_PRESENTATION', "That's not quite what I last showed you — let me re-run it and check again.")
  }

  const plan = await db().generatedPlan.findUnique({ where: { userId } })
  if (!plan) return err('NO_PLAN', "I don't have a roadmap on file for you.")
  if (!alreadyCommitted && plan.version !== scenario.baseVersion) {
    return err('STALE', 'Your plan changed since we looked at this — want me to run it again on the current version?')
  }

  const validation = scenario.validation as unknown as ValidationResult
  if (!validation.ok) return err('VALIDATION_FAILED', "That change isn't valid yet, so I can't save it as is.")

  const ops = scenario.operations as unknown as ScenarioOp[]
  if (ops.some((o) => PROGRAM_OPS.has(o.op)) && confirmation.channel !== 'app') {
    return err('REQUIRES_APP_CONFIRMATION', "Changing your major, minor, or specializations needs a tap in the app — I've sent you a notification.")
  }

  if (confirmation.channel === 'voice') {
    const affirmative = checkAffirmative(confirmation.utterance ?? '')
    if (!affirmative.ok) return err('AMBIGUOUS_CONFIRMATION', 'I want to make sure before I save this — was that a yes?')
  }

  const resultInputs = scenario.resultInputs as unknown as CommitSnapshot
  const snapshot: CommitSnapshot = {
    targetProgramId: resultInputs.targetProgramId,
    minorProgramId: resultInputs.minorProgramId ?? null,
    targetSpecializationIds: resultInputs.targetSpecializationIds,
    coursesPerTerm: resultInputs.coursesPerTerm,
    startSeason: resultInputs.startSeason,
    startYear: resultInputs.startYear,
    terms: scenario.resultTerms as unknown as PlannedTerm[],
    validation,
  }

  try {
    const [, version] = await db().$transaction([
      ...planVersionWrites(plan.planId, plan.version + 1, snapshot, { createdBy: 'scenario_commit', scenarioId }),
      db().scenario.update({ where: { scenarioId }, data: { status: 'committed' } }),
      db().auditLog.create({
        data: {
          userId,
          actor: 'max',
          action: 'plan.commit',
          before: plan.terms as unknown as Prisma.InputJsonValue,
          after: snapshot.terms as unknown as Prisma.InputJsonValue,
          callId: confirmation.callId ?? scenario.callId ?? null,
          scenarioId,
        },
      }),
    ])
    return { ok: true, versionId: String((version as { planVersionId: bigint }).planVersionId), undoAvailable: true }
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      const existing = await db().planVersion.findUnique({ where: { scenarioId } })
      if (existing) return { ok: true, versionId: String(existing.planVersionId), undoAvailable: true }
    }
    throw e
  }
}
