// The one write path to GeneratedPlan (spec 03's "single write path": every place that writes it
// must bump version, write the head, and append a PlanVersion in the same transaction, or history
// breaks). Used by api/max/_scenarios.ts (scenario commits) and api/session.ts (onboarding saves).
import { createHash } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { db } from './_db.js'
import type { PlannedTerm } from '../src/lib/plan.js'
import type { PlanInputs, ValidationResult } from '../src/lib/max/planningAdapter.js'

// v2: PlannedCourse carries cu, group and year; the scheduler honours offerings, credit and level
// gates, and the senior CMPT limit.
// v3: Max's plan is the app's plan: the program's degree, the student's own Fall/Winter and
// Spring/Summer loads, registered courses booked in their terms; the hash covers every input.
export const PLANNER_VERSION = 'lib/planner@exact-v3'

const byCode = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

/**
 * sha256 of every planner input, sorted, so the same student and settings always hash the same.
 * A snapshot without `inputs` (a scenario commit's resultInputs) hashes the fields it has, in a fixed
 * key order.
 */
export function hashInputs(snapshot: Omit<PlanSnapshot, 'terms' | 'validation'>): string {
  const inputs = snapshot.inputs ?? {
    program: snapshot.targetProgramId,
    specializations: [...snapshot.targetSpecializationIds].sort(byCode),
    load: snapshot.coursesPerTerm,
    start: { season: snapshot.startSeason, year: snapshot.startYear },
  }
  return createHash('sha256').update(JSON.stringify(inputs)).digest('hex')
}

export interface PlanSnapshot {
  targetProgramId: string
  minorProgramId: string | null
  targetSpecializationIds: string[]
  coursesPerTerm: number
  startSeason: string
  startYear: number
  terms: PlannedTerm[]
  validation: ValidationResult
  /** Every input the plan was built from (regenerate()'s `inputs`); what inputsHash hashes. */
  inputs?: PlanInputs
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
