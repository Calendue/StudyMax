// The one write path to GeneratedPlan (spec 03's "single write path": every place that writes it
// must bump version, write the head, and append a PlanVersion in the same transaction, or history
// breaks). Used by api/max/_scenarios.ts (scenario commits) and api/session.ts (onboarding saves).
import { createHash } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { db } from './_db.js'
import type { PlannedTerm } from '../src/lib/plan.js'
import type { ValidationResult } from '../src/lib/max/planningAdapter.js'

// v2: PlannedCourse carries cu, group and year; the scheduler honours offerings, credit and level
// gates, and the senior CMPT limit.
// v3: server plans go through planningAdapter.regenerate(), the app's own plan — the whole degree,
// credentials and a declared minor, at the student's load and Spring/Summer preferences.
// v4: the exact planner (src/lib/planner): earliest graduation proven, no relaxed rules, loads 1-5
// and Spring/Summer 0-2, full-year courses in two terms; the hash covers every planner input.
export const PLANNER_VERSION = 'lib/planner@exact-v4'

const sortedCodes = (codes: readonly string[] | undefined) => [...new Set(codes ?? [])].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))

/** Every planner input, normalised and sorted, so the same student always hashes the same. */
function hashInputs(snapshot: PlanSnapshot): string {
  const inputs = {
    targetProgramId: snapshot.targetProgramId,
    minorProgramId: snapshot.minorProgramId,
    targetSpecializationIds: sortedCodes(snapshot.targetSpecializationIds),
    coursesPerTerm: snapshot.coursesPerTerm,
    springSummer: snapshot.springSummer,
    summerPerTerm: snapshot.summerPerTerm,
    startSeason: snapshot.startSeason,
    startYear: snapshot.startYear,
    completed: sortedCodes(snapshot.completed),
    inProgress: sortedCodes(snapshot.inProgress),
    away: snapshot.away ?? null,
  }
  return createHash('sha256').update(JSON.stringify(inputs)).digest('hex')
}

export interface PlanSnapshot {
  targetProgramId: string
  minorProgramId: string | null
  targetSpecializationIds: string[]
  coursesPerTerm: number
  /** Spring/Summer preferences the plan was built with. No GeneratedPlan/PlanVersion columns — kept in the inputs hash. */
  springSummer: boolean
  summerPerTerm: number
  startSeason: string
  startYear: number
  terms: PlannedTerm[]
  validation: ValidationResult
  /** Hashed with the rest (not stored in columns): the courses and internship year the plan was built from. */
  completed?: string[]
  inProgress?: string[]
  away?: number | null
}

/** Bumps GeneratedPlan.version, writes the head, and appends a PlanVersion — always together (I4). */
export function planVersionWrites(
  planId: bigint,
  newVersion: number,
  snapshot: PlanSnapshot,
  meta: { createdBy: string; scenarioId?: bigint },
) {
  const lastTerm = snapshot.terms[snapshot.terms.length - 1]
  const [projectedGradSeason, projectedGradYearStr] = lastTerm ? lastTerm.label.split(' ') : [null, null]
  return [
    db().generatedPlan.update({
      where: { planId },
      data: {
        targetProgramId: snapshot.targetProgramId,
        targetSpecializationIds: snapshot.targetSpecializationIds,
        coursesPerTerm: snapshot.coursesPerTerm,
        startSeason: snapshot.startSeason,
        startYear: snapshot.startYear,
        terms: snapshot.terms as unknown as Prisma.InputJsonValue,
        version: newVersion,
      },
    }),
    db().planVersion.create({
      data: {
        planId,
        versionNumber: newVersion,
        parentVersion: newVersion - 1,
        targetProgramId: snapshot.targetProgramId,
        minorProgramId: snapshot.minorProgramId,
        targetSpecializationIds: snapshot.targetSpecializationIds,
        coursesPerTerm: snapshot.coursesPerTerm,
        startSeason: snapshot.startSeason,
        startYear: snapshot.startYear,
        terms: snapshot.terms as unknown as Prisma.InputJsonValue,
        projectedGradSeason,
        projectedGradYear: projectedGradYearStr ? Number(projectedGradYearStr) : null,
        validation: snapshot.validation as unknown as Prisma.InputJsonValue,
        plannerVersion: PLANNER_VERSION,
        inputsHash: hashInputs(snapshot),
        createdBy: meta.createdBy,
        scenarioId: meta.scenarioId ?? null,
      },
    }),
  ] as const
}

/** One PlanVersion row (createdBy: "onboarding" or "backfill"), for a brand-new GeneratedPlan. */
export function firstPlanVersionData(planId: bigint, snapshot: PlanSnapshot, createdBy: string) {
  const lastTerm = snapshot.terms[snapshot.terms.length - 1]
  const [projectedGradSeason, projectedGradYearStr] = lastTerm ? lastTerm.label.split(' ') : [null, null]
  return {
    planId,
    versionNumber: 1,
    parentVersion: null,
    targetProgramId: snapshot.targetProgramId,
    minorProgramId: snapshot.minorProgramId,
    targetSpecializationIds: snapshot.targetSpecializationIds,
    coursesPerTerm: snapshot.coursesPerTerm,
    startSeason: snapshot.startSeason,
    startYear: snapshot.startYear,
    terms: snapshot.terms as unknown as Prisma.InputJsonValue,
    projectedGradSeason,
    projectedGradYear: projectedGradYearStr ? Number(projectedGradYearStr) : null,
    validation: snapshot.validation as unknown as Prisma.InputJsonValue,
    plannerVersion: PLANNER_VERSION,
    inputsHash: hashInputs(snapshot),
    createdBy,
  }
}
