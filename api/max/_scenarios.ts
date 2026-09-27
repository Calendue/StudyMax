// Scenario lifecycle and server-checked commits (docs/BayMax/spec/06-scenarios-and-commits.md,
// docs/BayMax/implementation/04-scenarios-and-commits.md). This is the enforcement point for I2:
// the LLM can create and present scenarios freely, but only the server decides whether a commit is
// allowed.
//
// Lives under api/, not src/lib/max/ (where the implementation doc originally put it): it needs
// @prisma/client and node:crypto, and src/ compiles under tsconfig.app.json (bundler resolution, no
// Node types — it's the browser build). src/lib/max/planningAdapter.ts stays under src/ because it's
// genuinely pure (no DB, no Node builtins); this module is the one that actually touches the database.
//
// Call-scoped scenarios: when the app placed the call with its exact plan inputs (MaxCall.planInputs,
// src/lib/max/live.ts CallPlanInputs), every scenario in that call plans from those inputs, so Max's
// "before" is exactly the plan on the student's screen and each change reshapes that tree.
import { createHash } from 'node:crypto'
import { Prisma, type GeneratedPlan } from '@prisma/client'
import { db } from '../_db.js'
import { isSharedGuest } from './_demoUser.js'
import { planVersionWrites, type PlanSnapshot } from '../_planVersion.js'
import { isActiveCourse } from '../../src/data/activeCourses.js'
import { programs } from '../../src/data/programs/index.js'
import { computeCredentials } from '../../src/lib/credentials.js'
import { computeMatches } from '../../src/lib/match.js'
import type { CallPlanInputs, LiveFrame, LiveInputs, LiveScenario } from '../../src/lib/max/live.js'
import {
  diff,
  planHash,
  regenerate,
  validate,
  type AdapterInput,
  type RoadmapDiff,
  type ValidationResult,
} from '../../src/lib/max/planningAdapter.js'
import { PREFERENCE_KEYS, SUPPORTED_OPS, type PreferenceKey, type ScenarioOp } from '../../src/lib/max/types.js'
import {
  DEFAULT_SUMMER_COURSES,
  termFromLabel,
  termOrder,
  type PlannedTerm,
  type Season,
  type TermStart,
} from '../../src/lib/plan.js'

const SCENARIO_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days (spec 06's "expired" state)
const MAX_FRAMES = 4

export type ToolError = { ok: false; code: string; speakable: string }

function err(code: string, speakable: string): ToolError {
  return { ok: false, code, speakable }
}

// --- planner-input snapshot: the current official state, and what an op list does to it ---

export interface Snapshot {
  completed: string[]
  /** What the plan treats as under way: the enrolled courses minus droppedCourses. */
  inProgress: string[]
  /** What they're actually enrolled in — a committed drop never changes these. */
  enrolled: string[]
  /**
   * Courses the official plan has dropped. A committed DROP_COURSE only models the drop — the student
   * still drops it with the registrar (spec 06) — and this is how the official version remembers it,
   * so the next scenario starts from the committed plan, not before it.
   */
  droppedCourses: string[]
  targetProgramId: string
  minorProgramId: string | null
  /** The plan's targets in the app's order: the hero first, then the extras (a declared minor's lists included). */
  targetIds: string[]
  coursesPerTerm: number
  springSummer: boolean
  summerPerTerm: number
  start: TermStart
  inProgressSeasons: Record<string, Season>
  degreeVariant: string | null
  away: number | null
  /** Courses the student put in a term themselves, by term label (PlanOptions.pinned). */
  pinned: Record<string, string[]>
  /** Courses asked for in no particular term: the planner places them, prerequisites first (PlanOptions.added). */
  added: string[]
  /** The app's internship answer (year 3 or 4, or none); undefined when the app didn't say. */
  internship?: 3 | 4 | null
  /** The academic year each internship answer would leave empty, as the app worked it out. */
  internshipAYs?: Partial<Record<'3' | '4', number>>
  today: Date
}

/** The call a scenario belongs to, and the app's plan inputs when the app placed it. */
export interface CallScope {
  callId: bigint
  planInputs: CallPlanInputs | null
  /** The demo student every guest shares: its saved versions belong to other guests' calls too. */
  isGuest?: boolean
}

/** The planner inputs as a scenario sees them — the same regenerate() the app's plan is checked against. */
export function adapterInput(s: Snapshot): AdapterInput {
  return {
    completed: new Set(s.completed),
    inProgress: new Set(s.inProgress),
    targetProgramId: s.targetProgramId,
    // targetIds already holds the minor's lists in order, so regenerate resolves hero/extras exactly as the app does.
    targetSpecializationIds: s.targetIds,
    minorProgramId: null,
    coursesPerTerm: s.coursesPerTerm,
    springSummer: s.springSummer,
    summerPerTerm: s.summerPerTerm,
    start: s.start,
    today: s.today,
    inProgressSeasons: s.inProgressSeasons,
    degreeVariant: s.degreeVariant,
    away: s.away,
    pinned: s.pinned,
    added: s.added,
  }
}

/** What the tree needs from a snapshot to redraw it. */
export function liveInputs(
  s: Pick<Snapshot, 'inProgress' | 'targetIds' | 'coursesPerTerm' | 'springSummer' | 'summerPerTerm' | 'droppedCourses'> &
    Partial<Pick<Snapshot, 'targetProgramId' | 'minorProgramId' | 'degreeVariant' | 'pinned' | 'added' | 'internship'>>,
): LiveInputs {
  return {
    inProgress: s.inProgress,
    targetIds: s.targetIds,
    coursesPerTerm: s.coursesPerTerm,
    springSummer: s.springSummer,
    summerPerTerm: s.summerPerTerm,
    droppedCourses: s.droppedCourses,
    ...(s.targetProgramId !== undefined ? { programId: s.targetProgramId } : {}),
    ...(s.minorProgramId !== undefined ? { minorId: s.minorProgramId } : {}),
    ...(s.degreeVariant !== undefined ? { degreeVariant: s.degreeVariant } : {}),
    ...(s.pinned !== undefined ? { pinned: s.pinned } : {}),
    ...(s.added !== undefined ? { added: s.added } : {}),
    ...(s.internship !== undefined ? { internship: s.internship } : {}),
  }
}

/** "2026-09-27" → a local Date at midnight (the app's today). */
function parseDay(day: string | undefined): Date {
  const m = day?.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date()
}

/** Onboarding's seed for a saved account: the concentrations, then a declared minor's lists (App.tsx seedOf). */
function seedOf(concentrationIds: string[], minorId: string | null): string[] {
  const minorSpecIds = programs.find((p) => p.id === minorId)?.specializations.map((s) => s.id) ?? []
  return [...concentrationIds, ...minorSpecIds]
}

/** The program specializations among a target list — what GeneratedPlan.targetSpecializationIds stores. */
function programSpecIds(programId: string, targetIds: string[]): string[] {
  const own = new Set(programs.find((p) => p.id === programId)?.specializations.map((s) => s.id) ?? [])
  return targetIds.filter((id) => own.has(id))
}

// --- op cleaning (pure) ---

/** "cmpt 370", "CMPT-370", " Cmpt370 " → "CMPT370", the catalogue's format. Voice models say codes with a space. */
export function normalizeCourseCode(code: unknown): string {
  return typeof code === 'string' ? code.toUpperCase().replace(/[^A-Z0-9]/g, '') : ''
}

const UNSUPPORTED = err(
  'UNSUPPORTED_OPERATION',
  "I can't make that kind of change — I can add, move or drop a course, change your pace or summers, aim for a graduation term, switch your specialization, minor, major or degree, set an internship year, or go back to an earlier version.",
)

const SEASONS: [RegExp, Season][] = [
  [/fall|autumn/i, 'Fall'],
  [/winter/i, 'Winter'],
  [/spring|summer/i, 'Spring/Summer'],
]

/** { season: "winter", year: 2028 } or "Winter 2028" → a term, or null. Model output, so both shapes. */
export function termOf(raw: unknown): TermStart | null {
  const obj = raw as { season?: unknown; year?: unknown } | null
  const text = typeof raw === 'string' ? raw : typeof obj?.season === 'string' ? `${obj.season} ${obj.year}` : ''
  const season = SEASONS.find(([re]) => re.test(text))?.[1]
  const year = Number(text.match(/\b(20\d\d)\b/)?.[1])
  return season && year >= 2020 && year <= 2100 ? { season, year } : null
}

const labelOf = (t: TermStart) => `${t.season} ${t.year}`

function courseCodeOf(raw: unknown): string | ToolError {
  const code = normalizeCourseCode(raw)
  if (!/^[A-Z]{2,5}\d{3}$/.test(code)) return err('INVALID_COURSE', "I didn't catch which course — could you say the course code again?")
  return code
}

const NONE_RE = /^(none|null|no|remove|no minor|no internship)?$/i

function preferenceValue(key: PreferenceKey, value: unknown): number | boolean | null {
  const rule = PREFERENCE_KEYS[key]
  if (rule.kind === 'bool') {
    if (typeof value === 'boolean') return value
    const text = String(value).trim().toLowerCase()
    return ['true', 'yes', 'on', '1'].includes(text) ? true : ['false', 'no', 'off', '0'].includes(text) ? false : null
  }
  const n = Number(value)
  return Number.isInteger(n) && n >= rule.min && n <= rule.max ? n : null
}

/**
 * Checks and cleans ops from the model before anything runs: a known op name, a real course code,
 * preference or version number, never an empty list. Tool arguments are untrusted model output (spec 07).
 */
export function cleanOps(raw: unknown): ScenarioOp[] | ToolError {
  if (!Array.isArray(raw) || raw.length === 0) return err('MISSING_OPS', "I didn't catch what change you want to look at.")
  const ops: ScenarioOp[] = []
  for (const item of raw as Record<string, unknown>[]) {
    const op = item?.op
    if (typeof op !== 'string' || !SUPPORTED_OPS.has(op as ScenarioOp['op'])) return UNSUPPORTED
    if (op === 'DROP_COURSE') {
      const courseCode = normalizeCourseCode(item.courseCode)
      if (!/^[A-Z]{2,5}\d{3}$/.test(courseCode)) return err('INVALID_COURSE', "I didn't catch which course — could you say the course code again?")
      ops.push({ op: 'DROP_COURSE', courseCode })
    } else if (op === 'SET_PREFERENCE') {
      const key = item.key as PreferenceKey
      if (typeof key !== 'string' || !(key in PREFERENCE_KEYS)) return UNSUPPORTED
      const value = preferenceValue(key, item.value)
      if (value === null) {
        return err(
          'INVALID_PREFERENCE',
          key === 'maxCoursesPerTerm'
            ? 'I can plan between 1 and 5 courses a term.'
            : key === 'maxSummerCourses'
              ? 'I can plan between 1 and 3 courses in a summer.'
              : "I didn't catch whether you want summers on or off.",
        )
      }
      ops.push({ op: 'SET_PREFERENCE', key, value })
    } else if (op === 'SET_SPECIALIZATIONS') {
      const raw = item.specializationIds
      const ids = (Array.isArray(raw) ? raw : typeof raw === 'string' ? [raw] : []).filter((x): x is string => typeof x === 'string' && x.trim() !== '')
      if (ids.length === 0 || ids.length > 4) return err('INVALID_SPECIALIZATION', "I didn't catch which specialization — could you say it again?")
      ops.push({ op: 'SET_SPECIALIZATIONS', specializationIds: ids.map((s) => s.trim()) })
    } else if (op === 'ADD_COURSE' || op === 'MOVE_COURSE' || op === 'PIN_COURSE') {
      const courseCode = courseCodeOf(item.courseCode)
      if (typeof courseCode !== 'string') return courseCode
      const rawTerm = item.toTerm ?? item.term
      const term = rawTerm === undefined || rawTerm === null || rawTerm === '' ? null : termOf(rawTerm)
      if (rawTerm !== undefined && rawTerm !== null && rawTerm !== '' && !term) return err('INVALID_TERM', "I didn't catch which term — could you say it like Winter 2028?")
      if (op !== 'ADD_COURSE' && !term) return err('INVALID_TERM', 'Which term should it go in?')
      ops.push(op === 'ADD_COURSE' ? { op, courseCode, ...(term ? { term } : {}) } : op === 'MOVE_COURSE' ? { op, courseCode, toTerm: term! } : { op, courseCode, term: term! })
    } else if (op === 'UNPIN_COURSE') {
      const courseCode = courseCodeOf(item.courseCode)
      if (typeof courseCode !== 'string') return courseCode
      ops.push({ op, courseCode })
    } else if (op === 'SET_GRAD_TARGET') {
      const term = termOf(item.term)
      if (!term) return err('INVALID_TERM', "I didn't catch when you want to finish — could you say it like Winter 2029?")
      ops.push({ op, term })
    } else if (op === 'SET_MAJOR' || op === 'SET_MINOR') {
      const said = typeof item.programId === 'string' ? item.programId.trim() : item.programId === null ? '' : undefined
      if (said === undefined || (op === 'SET_MAJOR' && said === '')) return err('INVALID_PROGRAM', "I didn't catch which program — could you say it again?")
      ops.push(op === 'SET_MAJOR' ? { op, programId: said } : { op, programId: NONE_RE.test(said) ? null : said })
    } else if (op === 'SET_DEGREE') {
      const variant = typeof item.variant === 'string' ? item.variant.trim() : ''
      if (!variant) return err('INVALID_DEGREE', 'Which degree — the Four-year, Honours or Three-year?')
      ops.push({ op, variant })
    } else if (op === 'SET_INTERNSHIP') {
      const n = Number(item.year)
      const year = n === 3 || n === 4 ? n : item.year === null || NONE_RE.test(String(item.year ?? '')) ? null : undefined
      if (year === undefined) return err('INVALID_INTERNSHIP', 'I can set an internship in your third or fourth year, or take it out.')
      ops.push({ op, year })
    } else {
      const versionNumber = Number(item.versionNumber)
      if (!Number.isInteger(versionNumber) || versionNumber < 1) return err('UNKNOWN_VERSION', "I didn't catch which version to go back to.")
      ops.push({ op: 'RESTORE_VERSION', versionNumber })
    }
  }
  return ops
}

const loose = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

/** A specialization or credential by id or spoken name ("software development") — or null. */
export function resolveSpecialization(programId: string, completed: string[], said: string): { id: string; name: string } | null {
  const program = programs.find((p) => p.id === programId)
  if (!program) return null
  const candidates = [...program.specializations, ...computeCredentials(programs, new Set(completed), programId).map((c) => c.spec)]
  const key = loose(said)
  const hit =
    candidates.find((s) => s.id === said) ??
    candidates.find((s) => loose(s.id) === key || loose(s.name) === key) ??
    candidates.find((s) => loose(s.name).includes(key) && key.length >= 4)
  return hit ? { id: hit.id, name: hit.name } : null
}

/** Applies every op but RESTORE_VERSION to a snapshot — pure, so the sequences are testable. */
export function applyPlanOps(base: Snapshot, ops: ScenarioOp[]): Snapshot | ToolError {
  const inProgress = new Set(base.inProgress)
  const dropped = new Set(base.droppedCourses)
  let next: Snapshot = { ...base }
  for (const op of ops) {
    if (op.op === 'DROP_COURSE') {
      if (base.droppedCourses.includes(op.courseCode)) {
        return err('ALREADY_DROPPED', `${op.courseCode} is already dropped in your saved plan.`)
      }
      if (dropped.has(op.courseCode)) continue // the same drop said twice in one scenario
      if (!inProgress.has(op.courseCode)) {
        return err('COURSE_NOT_IN_PROGRESS', `I don't have ${op.courseCode} listed as something you're currently taking.`)
      }
      inProgress.delete(op.courseCode)
      dropped.add(op.courseCode)
    } else if (op.op === 'SET_PREFERENCE') {
      const key = op.key as PreferenceKey
      if (key === 'maxCoursesPerTerm') next = { ...next, coursesPerTerm: op.value as number }
      else if (key === 'maxSummerCourses') next = { ...next, summerPerTerm: op.value as number }
      else if (key === 'springSummer') next = { ...next, springSummer: op.value as boolean }
    } else if (op.op === 'SET_SPECIALIZATIONS') {
      const resolved: string[] = []
      for (const said of op.specializationIds) {
        const hit = resolveSpecialization(base.targetProgramId, base.completed, said)
        if (!hit) return err('INVALID_SPECIALIZATION', `I couldn't find a specialization called ${said}.`)
        if (!resolved.includes(hit.id)) resolved.push(hit.id)
      }
      // The switch replaces the program's specializations; certificates and a minor stay in the canopy.
      const own = new Set(programSpecIds(next.targetProgramId, next.targetIds))
      next = { ...next, targetIds: [...resolved, ...next.targetIds.filter((id) => !own.has(id) && !resolved.includes(id))] }
    } else {
      const current: Snapshot = { ...next, inProgress: [...inProgress], droppedCourses: [...dropped] }
      const changed = applyProgramOp(current, op)
      if ('code' in changed) return changed
      next = changed
    }
  }
  return { ...next, inProgress: [...inProgress], droppedCourses: [...dropped] }
}

/** Where a course sits in a plan, by term label — or null. */
function plannedTermOf(terms: PlannedTerm[], code: string): string | null {
  return terms.find((t) => t.courses.some((c) => c.code === code))?.label ?? null
}

function withoutPin(pinned: Record<string, string[]>, code: string): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(pinned)
      .map(([label, codes]) => [label, codes.filter((c) => c !== code)] as const)
      .filter(([, codes]) => codes.length > 0),
  )
}

function pinnedIn(s: Snapshot, code: string, term: TermStart): Snapshot {
  const pinned = withoutPin(s.pinned, code)
  const label = labelOf(term)
  return { ...s, pinned: { ...pinned, [label]: [...(pinned[label] ?? []), code] }, added: s.added.filter((c) => c !== code) }
}

const spoken = (code: string) => code.replace(/^([A-Z]+)(\d)/, '$1 $2')

/** Finish of a plan as a sortable number (null: nothing left to plan). */
function finishOrder(terms: PlannedTerm[]): number | null {
  const last = terms[terms.length - 1]
  const t = last ? termFromLabel(last.label) : null
  return t ? termOrder(t) : null
}

const loose2 = (s: string) => s.toLowerCase().replace(/\bminor\b|\bmajor\b|\bin\b|\bof\b/g, '').replace(/[^a-z0-9]/g, '')

/** A program by id or spoken name, among those of one kind. */
function resolveProgram(said: string, kind: 'major' | 'minor') {
  // A major Max can switch to has specializations to plan toward (the app's call inputs need one).
  const pool = programs.filter((p) => (kind === 'minor' ? p.kind === 'minor' : (p.kind === undefined || p.kind === 'major') && p.specializations.length > 0))
  const key = loose2(said)
  return (
    pool.find((p) => p.id === said) ??
    pool.find((p) => loose2(p.id) === key || loose2(p.name) === key) ??
    (key.length >= 4 ? pool.find((p) => loose2(p.name).includes(key) || key.includes(loose2(p.name))) : undefined) ??
    null
  )
}

const DEGREE_WORDS: [RegExp, RegExp][] = [
  [/honou?rs/i, /honours/i],
  [/three|\b3\b/i, /three|-3$/i],
  [/four|\b4\b/i, /four|-4$/i],
]

/** A degree variant of a program by id or spoken name ("honours", "the three-year"). */
function resolveDegree(programId: string, said: string) {
  const degrees = programs.find((p) => p.id === programId)?.degrees ?? []
  return (
    degrees.find((d) => d.variant === said) ??
    DEGREE_WORDS.flatMap(([word, match]) => (word.test(said) ? degrees.filter((d) => match.test(d.variant) || match.test(d.name)) : []))[0] ??
    null
  )
}

/** Everything but drops, pace, summers and specializations: the ops that move courses or change the program. */
function applyProgramOp(s: Snapshot, op: ScenarioOp): Snapshot | ToolError {
  switch (op.op) {
    case 'ADD_COURSE':
    case 'MOVE_COURSE':
    case 'PIN_COURSE': {
      const code = op.courseCode
      const term = op.op === 'ADD_COURSE' ? op.term : op.op === 'MOVE_COURSE' ? op.toTerm : op.term
      if (!isActiveCourse(code)) return err('UNKNOWN_COURSE', `I can't find ${spoken(code)} in the catalogue — could you say the code again?`)
      if (s.completed.includes(code)) return err('ALREADY_TAKEN', `You've already taken ${spoken(code)}.`)
      if (s.inProgress.includes(code)) return err('IN_PROGRESS', `You're taking ${spoken(code)} right now.`)
      if (term) {
        if (termOrder(term) < termOrder(s.start)) {
          return err('TERM_PAST', `Your plan starts in ${labelOf(s.start)}, so I can only put courses from then on.`)
        }
        return pinnedIn(s, code, term)
      }
      const planned = plannedTermOf(regenerate(adapterInput(s)).terms, code)
      if (planned) return err('ALREADY_PLANNED', `${spoken(code)} is already in your plan for ${planned}. Want it in a different term?`)
      // No term said: the planner places it like a requirement, in a term that runs it, prerequisites first.
      return { ...s, added: [...s.added, code] }
    }
    case 'UNPIN_COURSE': {
      const placed = Object.values(s.pinned).some((codes) => codes.includes(op.courseCode)) || s.added.includes(op.courseCode)
      if (!placed) {
        return err('NOT_PINNED', `${spoken(op.courseCode)} isn't a course you added or placed yourself — I can move it instead.`)
      }
      return { ...s, pinned: withoutPin(s.pinned, op.courseCode), added: s.added.filter((c) => c !== op.courseCode) }
    }
    case 'SET_GRAD_TARGET': {
      const goal = termOrder(op.term)
      const now = finishOrder(regenerate(adapterInput(s)).terms)
      if (now !== null && now <= goal) {
        return err('ALREADY_ON_TRACK', `You're already on track to finish by ${labelOf(op.term)} with your current plan.`)
      }
      // The lightest change that gets there: more courses a term first, then summers.
      const tries: Pick<Snapshot, 'coursesPerTerm' | 'springSummer' | 'summerPerTerm'>[] = []
      for (let p = s.coursesPerTerm; p <= 5; p++) tries.push({ coursesPerTerm: p, springSummer: s.springSummer, summerPerTerm: s.summerPerTerm })
      if (!s.springSummer) {
        for (let p = s.coursesPerTerm; p <= 5; p++) for (let q = 1; q <= 3; q++) tries.push({ coursesPerTerm: p, springSummer: true, summerPerTerm: q })
      }
      let best: number | null = null
      for (const pace of tries) {
        const trial = { ...s, ...pace }
        const finish = finishOrder(regenerate(adapterInput(trial)).terms)
        if (finish !== null && finish <= goal) return trial
        if (finish !== null && (best === null || finish < best)) best = finish
      }
      const earliest = best === null ? null : `${['Winter', 'Spring/Summer', 'Fall'][best % 10]} ${Math.floor(best / 10)}`
      return err('CANT_MEET_TARGET', `Even at five courses a term with summers, the earliest you'd finish is ${earliest ?? 'later than that'}.`)
    }
    case 'SET_MAJOR': {
      const program = resolveProgram(op.programId, 'major')
      if (!program) return err('UNKNOWN_PROGRAM', `I couldn't find a major called ${op.programId} at USask in StudyMax.`)
      if (program.id === s.targetProgramId) return err('NO_CHANGE', `You're already in ${program.name}.`)
      // A new major leads with its own closest specialization (as the reveal would); a minor's lists stay.
      const minorSpecs = programs.find((p) => p.id === s.minorProgramId)?.specializations.map((x) => x.id) ?? []
      const closest = computeMatches(program.specializations, new Set(s.completed), program.degree).find((m) => !m.spec.unavailable)
      return {
        ...s,
        targetProgramId: program.id,
        targetIds: [...(closest ? [closest.spec.id] : []), ...s.targetIds.filter((id) => minorSpecs.includes(id))],
        degreeVariant: null,
      }
    }
    case 'SET_MINOR': {
      const program = op.programId === null ? null : resolveProgram(op.programId, 'minor')
      if (op.programId !== null && !program) return err('UNKNOWN_PROGRAM', `I couldn't find a minor called ${op.programId}.`)
      const oldSpecs = new Set(programs.find((p) => p.id === s.minorProgramId)?.specializations.map((x) => x.id) ?? [])
      const newSpecs = program?.specializations.map((x) => x.id) ?? []
      return {
        ...s,
        minorProgramId: program?.id ?? null,
        targetIds: [...s.targetIds.filter((id) => !oldSpecs.has(id) && !newSpecs.includes(id)), ...newSpecs],
      }
    }
    case 'SET_DEGREE': {
      const degrees = programs.find((p) => p.id === s.targetProgramId)?.degrees ?? []
      if (degrees.length < 2) return err('NO_DEGREE_CHOICE', "Your program only has the one degree mapped, so there's nothing to switch to.")
      const hit = resolveDegree(s.targetProgramId, op.variant)
      if (!hit) return err('UNKNOWN_DEGREE', `I can switch you to ${degrees.map((d) => d.name).join(', ')}.`)
      return { ...s, degreeVariant: hit.variant }
    }
    case 'SET_INTERNSHIP': {
      if (op.year === null) return { ...s, internship: null, away: null }
      const ay = s.internshipAYs?.[String(op.year) as '3' | '4']
      if (ay === undefined) return err('NO_INTERNSHIP_YEAR', 'I can only set an internship year when you call me from the app — you can set it on the Plan tab.')
      return { ...s, internship: op.year, away: ay }
    }
    default:
      return UNSUPPORTED
  }
}

/** The courses a given official version had dropped (empty for anything not saved from a scenario). */
export async function droppedAt(planId: bigint, versionNumber: number): Promise<string[]> {
  const version = await db().planVersion.findUnique({
    where: { planId_versionNumber: { planId, versionNumber } },
    select: { scenario: { select: { resultInputs: true } } },
  })
  const inputs = version?.scenario?.resultInputs as { droppedCourses?: string[] } | null | undefined
  return inputs?.droppedCourses ?? []
}

/** The snapshot a call's inputs describe — the app's own plan. */
export function snapshotFromCall(p: CallPlanInputs): Snapshot {
  const enrolled = p.enrolled ?? p.inProgress
  return {
    completed: p.completed,
    inProgress: p.inProgress,
    enrolled,
    droppedCourses: p.droppedCourses ?? [],
    targetProgramId: p.programId,
    minorProgramId: p.minorId,
    targetIds: p.targetIds,
    coursesPerTerm: p.coursesPerTerm,
    springSummer: p.springSummer,
    summerPerTerm: p.summerPerTerm,
    start: p.start,
    inProgressSeasons: p.inProgressSeasons ?? {},
    degreeVariant: p.degreeVariant ?? null,
    away: p.away ?? null,
    pinned: p.pinned ?? {},
    added: p.added ?? [],
    ...(p.internship !== undefined ? { internship: p.internship } : {}),
    ...(p.internshipAYs ? { internshipAYs: p.internshipAYs } : {}),
    today: parseDay(p.today),
  }
}

async function loadCurrentSnapshot(
  userId: bigint,
  scope?: CallScope,
): Promise<{ plan: GeneratedPlan; snapshot: Snapshot; baselineTerms: PlannedTerm[] } | null> {
  const [plan, courses, profile] = await Promise.all([
    db().generatedPlan.findUnique({ where: { userId } }),
    db().studentCourse.findMany({ where: { userId } }),
    db().studentProfile.findUnique({ where: { userId } }),
  ])
  if (!plan) return null

  if (scope?.planInputs) {
    const snapshot = snapshotFromCall(scope.planInputs)
    // The baseline is the plan on the student's screen, not the DB head — so Max's "before" is what they see.
    return { plan, snapshot, baselineTerms: regenerate(adapterInput(snapshot)).terms }
  }

  // Registered courses are under way too — the same set api/session.ts plans around.
  const enrolled = [...new Set(courses.filter((c) => c.status === 'in_progress' || c.status === 'registered').map((c) => c.courseCode))]
  const droppedCourses = (await droppedAt(plan.planId, plan.version)).filter((code) => enrolled.includes(code))
  const minorId = profile?.minorProgramId ?? null
  return {
    plan,
    baselineTerms: plan.terms as unknown as PlannedTerm[],
    snapshot: {
      completed: courses.filter((c) => c.status === 'completed').map((c) => c.courseCode),
      inProgress: enrolled.filter((code) => !droppedCourses.includes(code)),
      enrolled,
      droppedCourses,
      targetProgramId: plan.targetProgramId,
      minorProgramId: minorId,
      targetIds: seedOf(plan.targetSpecializationIds, minorId),
      // The student's own preference, else what the plan was built with (spec 03's fallback rule).
      coursesPerTerm: profile?.maxCoursesPerTerm ?? plan.coursesPerTerm,
      springSummer: profile?.springSummer ?? false,
      summerPerTerm: profile?.maxSummerCourses ?? DEFAULT_SUMMER_COURSES,
      start: { season: plan.startSeason as TermStart['season'], year: plan.startYear },
      inProgressSeasons: {},
      degreeVariant: null,
      // Not a scenario op: a what-if keeps the student's internship year, so the diff never shows one.
      away: profile?.internshipAcademicYear ?? null,
      pinned: {},
      added: [],
      today: new Date(),
    },
  }
}

/** Applies validated ops to a snapshot. RESTORE_VERSION must be the only op (checked on append). */
async function applyOps(planId: bigint, base: Snapshot, ops: ScenarioOp[], scope?: CallScope): Promise<Snapshot | ToolError> {
  const restore = ops.find((o) => o.op === 'RESTORE_VERSION')
  if (restore && restore.op === 'RESTORE_VERSION') {
    const version = await db().planVersion.findUnique({
      where: { planId_versionNumber: { planId, versionNumber: restore.versionNumber } },
      include: { scenario: { select: { resultInputs: true, callId: true } } },
    })
    // A guest's saved versions share one account with every other guest's: anything not saved on this
    // call is someone else's plan. Going back past this call means the plan they started it with.
    if (scope?.isGuest && scope.planInputs && version?.scenario?.callId !== scope.callId) {
      return snapshotFromCall(scope.planInputs.original ?? scope.planInputs)
    }
    if (!version) return err('UNKNOWN_VERSION', `I don't have a version ${restore.versionNumber} to go back to.`)
    const saved = (version.scenario?.resultInputs ?? {}) as Partial<ResultInputs>
    // Completed courses stay current — restore rewinds the plan, not course history — but the drops go
    // back to that version's, so "undo that" after a committed drop really puts the course back.
    const droppedCourses = (saved.droppedCourses ?? []).filter((code) => base.enrolled.includes(code))
    const own = new Set(programSpecIds(base.targetProgramId, base.targetIds))
    return {
      ...base,
      inProgress: base.enrolled.filter((code) => !droppedCourses.includes(code)),
      droppedCourses,
      targetProgramId: version.targetProgramId,
      minorProgramId: version.minorProgramId,
      targetIds:
        saved.targetIds ?? [...version.targetSpecializationIds, ...base.targetIds.filter((id) => !own.has(id) && !version.targetSpecializationIds.includes(id))],
      coursesPerTerm: version.coursesPerTerm,
      springSummer: saved.springSummer ?? base.springSummer,
      summerPerTerm: saved.summerPerTerm ?? base.summerPerTerm,
      start: { season: version.startSeason as TermStart['season'], year: version.startYear },
      degreeVariant: saved.degreeVariant !== undefined ? saved.degreeVariant : base.degreeVariant,
      pinned: saved.pinned ?? base.pinned,
      added: saved.added ?? base.added,
      ...(saved.internship !== undefined ? { internship: saved.internship, away: saved.away ?? null } : {}),
    }
  }
  return applyPlanOps(base, ops)
}

/** What a scenario stores as its result inputs — enough to commit it, restore it and carry a call forward. */
export interface ResultInputs {
  targetProgramId: string
  minorProgramId: string | null
  /** The program specializations among targetIds (GeneratedPlan.targetSpecializationIds). */
  targetSpecializationIds: string[]
  targetIds: string[]
  coursesPerTerm: number
  springSummer: boolean
  summerPerTerm: number
  startSeason: string
  startYear: number
  droppedCourses: string[]
  inProgress: string[]
  enrolled: string[]
  /** Missing on scenarios saved before Max could change these. */
  degreeVariant?: string | null
  pinned?: Record<string, string[]>
  added?: string[]
  internship?: 3 | 4 | null
  away?: number | null
}

function resultInputsOf(s: Snapshot): ResultInputs {
  return {
    targetProgramId: s.targetProgramId,
    minorProgramId: s.minorProgramId,
    targetSpecializationIds: programSpecIds(s.targetProgramId, s.targetIds),
    targetIds: s.targetIds,
    coursesPerTerm: s.coursesPerTerm,
    springSummer: s.springSummer,
    summerPerTerm: s.summerPerTerm,
    startSeason: s.start.season,
    startYear: s.start.year,
    droppedCourses: s.droppedCourses,
    inProgress: s.inProgress,
    enrolled: s.enrolled,
    degreeVariant: s.degreeVariant,
    pinned: s.pinned,
    added: s.added,
    ...(s.internship !== undefined ? { internship: s.internship } : {}),
    away: s.away,
  }
}

/** The caption the live bar shows for one step of Max's proposal. */
export function captionOf(op: ScenarioOp, programId: string, completed: string[]): string {
  switch (op.op) {
    case 'DROP_COURSE':
      return `Dropping ${op.courseCode.replace(/^([A-Z]+)(\d)/, '$1 $2')}`
    case 'SET_PREFERENCE':
      if (op.key === 'maxCoursesPerTerm') return `${op.value} courses a term`
      if (op.key === 'maxSummerCourses') return `${op.value} course${op.value === 1 ? '' : 's'} a summer`
      return op.value ? 'Using Spring/Summer terms' : 'No Spring/Summer terms'
    case 'SET_SPECIALIZATIONS':
      return `Switching to ${op.specializationIds.map((s) => resolveSpecialization(programId, completed, s)?.name ?? s).join(' and ')}`
    case 'RESTORE_VERSION':
      return `Back to version ${op.versionNumber}`
    case 'ADD_COURSE':
      return op.term ? `Adding ${spoken(op.courseCode)} in ${labelOf(op.term)}` : `Adding ${spoken(op.courseCode)}`
    case 'MOVE_COURSE':
      return `Moving ${spoken(op.courseCode)} to ${labelOf(op.toTerm)}`
    case 'PIN_COURSE':
      return `Keeping ${spoken(op.courseCode)} in ${labelOf(op.term)}`
    case 'UNPIN_COURSE':
      return `Letting the plan decide on ${spoken(op.courseCode)}`
    case 'SET_GRAD_TARGET':
      return `Aiming to finish by ${labelOf(op.term)}`
    case 'SET_MAJOR':
      return `Switching your major to ${resolveProgram(op.programId, 'major')?.name ?? op.programId}`
    case 'SET_MINOR':
      return op.programId === null ? 'No minor' : `Adding the ${resolveProgram(op.programId, 'minor')?.name ?? op.programId}`
    case 'SET_DEGREE':
      return `Switching to the ${resolveDegree(programId, op.variant)?.name ?? op.variant}`
    case 'SET_INTERNSHIP':
      return op.year === null ? 'No internship year' : `Internship in Year ${op.year}`
    default:
      return 'Changing your plan'
  }
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
  /** One tree per new op, in order, for the live view to play step by step. */
  frames: LiveFrame[]
  requiresAppConfirmation: boolean
}

/**
 * Loads or creates a Scenario row, appends `ops`, recomputes (regenerate -> validate -> diff), and
 * writes the result back with status "computed". Does not mark it "presented" — the tool gateway
 * does that at return time (spec 07: "the tool result is exactly what Max will speak").
 */
export async function runScenario(
  userId: bigint,
  rawOps: unknown,
  opts: { scenarioId?: bigint; scope?: CallScope } = {},
): Promise<ScenarioResult | ToolError> {
  const ops = cleanOps(rawOps)
  if ('code' in ops) return ops

  const current = await loadCurrentSnapshot(userId, opts.scope)
  if (!current) return err('NO_PLAN', "I don't have a roadmap on file for you yet.")
  const { plan, snapshot: baseSnapshot, baselineTerms } = current

  const scenario = opts.scenarioId ? await db().scenario.findUnique({ where: { scenarioId: opts.scenarioId } }) : null
  if (opts.scenarioId && (!scenario || scenario.userId !== userId)) {
    return err('UNKNOWN_SCENARIO', "I've lost track of that plan change — let's start a new one.")
  }
  if (scenario && !['draft', 'computed', 'presented'].includes(scenario.status)) {
    return err('SCENARIO_CLOSED', "That plan change isn't open anymore — let's start a new one.")
  }
  if (scenario && scenario.expiresAt && scenario.expiresAt < new Date()) {
    return err('SCENARIO_EXPIRED', "That plan change has expired — let's look at it fresh.")
  }

  const priorOps = (scenario?.operations as unknown as ScenarioOp[]) ?? []
  const allOps = [...priorOps, ...ops]
  if (allOps.some((o) => o.op === 'RESTORE_VERSION') && allOps.length > 1) {
    return err('UNSUPPORTED_OPERATION', 'Going back to an earlier version has to be a change on its own.')
  }

  // One frame per new op, so the tree reshapes step by step as Max narrates (capped; the last is the result).
  const frames: LiveFrame[] = []
  let applied: Snapshot | null = null
  const firstFramed = Math.max(0, ops.length - MAX_FRAMES)
  for (let i = 0; i < ops.length; i++) {
    const step = await applyOps(plan.planId, baseSnapshot, [...priorOps, ...ops.slice(0, i + 1)], opts.scope)
    if ('code' in step) return step
    applied = step
    if (i >= firstFramed) {
      frames.push({
        caption: captionOf(ops[i], baseSnapshot.targetProgramId, baseSnapshot.completed),
        terms: regenerate(adapterInput(step)).terms,
        inputs: liveInputs(step),
      })
    }
  }
  if (!applied) return err('MISSING_OPS', "I didn't catch what change you want to look at.")

  const input = adapterInput(applied)
  const terms = frames[frames.length - 1]?.terms ?? regenerate(input).terms
  const validation = validate(terms, input)
  const roadmapDiff = diff(baselineTerms, terms, input.inProgress)
  const resultInputs = resultInputsOf(applied)

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
    callId: opts.scope?.callId ?? scenario?.callId ?? null,
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
    frames,
    // Every change saves on a clear spoken yes now (types.ts PROGRAM_OPS); a tap on Keep still works.
    requiresAppConfirmation: false,
  }
}

/** A stored scenario as the live view shows it (snapshot catch-up): its final tree as one frame. */
export function liveScenarioOf(scenario: {
  scenarioId: bigint
  status: string
  presentedHash: string | null
  operations: unknown
  resultInputs: unknown
  resultTerms: unknown
  diff: unknown
  validation: unknown
}): LiveScenario | null {
  if (!['presented', 'committed', 'discarded'].includes(scenario.status) || !scenario.resultTerms) return null
  const d = scenario.diff as RoadmapDiff
  const v = scenario.validation as ValidationResult
  const ri = scenario.resultInputs as ResultInputs
  return {
    scenarioId: String(scenario.scenarioId),
    status: scenario.status as LiveScenario['status'],
    presentedHash: scenario.presentedHash,
    requiresAppConfirmation: false,
    headline: d.headline,
    errors: v.issues.filter((i) => i.severity === 'ERROR').map((i) => i.message),
    graduation: { before: d.graduation.before, after: d.graduation.after },
    frames: [{ caption: d.headline[0] ?? '', terms: scenario.resultTerms as PlannedTerm[], inputs: liveInputsOf(ri) }],
  }
}

/** Live inputs from stored result inputs, tolerating a scenario saved before these fields existed. */
export function liveInputsOf(ri: ResultInputs): LiveInputs {
  return liveInputs({
    ...ri,
    minorProgramId: ri.minorProgramId ?? null,
    targetIds: ri.targetIds ?? ri.targetSpecializationIds ?? [],
    inProgress: ri.inProgress ?? [],
    droppedCourses: ri.droppedCourses ?? [],
  })
}

/** After a save in a call, the call's inputs become the saved plan's, so later changes build on it. */
export async function advanceCall(callId: bigint, ri: ResultInputs, terms: PlannedTerm[]): Promise<void> {
  const call = await db().maxCall.findUnique({ where: { callId }, select: { planInputs: true } })
  const prev = call?.planInputs as CallPlanInputs | null | undefined
  if (!prev) return
  // Keep what the call started with (only the first save records it), for a guest's "undo".
  const { original, ...startedWith } = prev
  const next: CallPlanInputs = {
    ...prev,
    original: original ?? startedWith,
    inProgress: ri.inProgress,
    enrolled: ri.enrolled,
    droppedCourses: ri.droppedCourses,
    targetIds: ri.targetIds,
    concentrationIds: ri.targetSpecializationIds,
    coursesPerTerm: ri.coursesPerTerm,
    springSummer: ri.springSummer,
    summerPerTerm: ri.summerPerTerm,
    start: { season: ri.startSeason as Season, year: ri.startYear },
    programId: ri.targetProgramId,
    minorId: ri.minorProgramId,
    ...(ri.degreeVariant !== undefined ? { degreeVariant: ri.degreeVariant } : {}),
    ...(ri.pinned ? { pinned: ri.pinned } : {}),
    ...(ri.added ? { added: ri.added } : {}),
    ...(ri.internship !== undefined ? { internship: ri.internship, away: ri.away ?? null } : {}),
    planHash: planHash(terms),
  }
  await db().maxCall.update({ where: { callId }, data: { planInputs: next as unknown as Prisma.InputJsonValue } })
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
  // A saved change can't be "left" after the fact — that's RESTORE_VERSION — so only an open one is discarded.
  if (scenario.status === 'committed') return err('ALREADY_SAVED', "That change is already saved — I can take you back to the version before it if you want.")
  if (!['draft', 'computed', 'presented'].includes(scenario.status)) return { ok: true as const }
  await db().scenario.update({ where: { scenarioId }, data: { status: 'discarded' } })
  return { ok: true as const }
}

// --- voice affirmative check (spec 06) — a small keyword classifier, not a model call ---
// Errs toward "not sure": a false no costs one re-ask, a false yes saves a plan nobody agreed to.

// Speech-to-text fillers a clear yes often starts with ("okay, yeah, save it").
const FILLER = String.raw`(?:(?:ok(?:ay)?|alright|all right|um+|uh+|oh|so|well|yeah|yes)[\s,.!]+)*`
const AFFIRMATIVE_RE = new RegExp(
  String.raw`^\s*${FILLER}(yes|yeah|yep|yup|sure|ok(?:ay)?|alright|go ahead|do it|let'?s do it|please do|please|confirm(?:ed)?|save it|sounds good|absolutely|definitely|correct)\b`,
  'i',
)
const HEDGE_RE = /\b(maybe|guess|but|and also|probably|i think|not sure|hold on|wait)\b/i
// Straight and curly apostrophes, and STT's apostrophe-less "dont".
const NEGATION_RE = /\b(no|nope|nah|don['’]?t|do not|not|never|cancel|stop)\b/i

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

// --- commit_scenario ---

export interface CommitConfirmation {
  channel: 'voice' | 'app'
  utterance?: string
}

export interface CommitSuccess {
  ok: true
  versionId: string
  undoAvailable: boolean
  /** For the live view (never spoken): what the app adopts. */
  live: { scenarioId: string; inputs: LiveInputs; terms: PlannedTerm[] }
}

/** Implements spec 06's commit check order in full, including the tier check (I2). */
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
  if (!alreadyCommitted && scenario.expiresAt && scenario.expiresAt < new Date()) {
    return err('SCENARIO_EXPIRED', "That plan change has expired — let me run it again before we save anything.")
  }

  const plan = await db().generatedPlan.findUnique({ where: { userId } })
  if (!plan) return err('NO_PLAN', "I don't have a roadmap on file for you.")
  // A call-scoped scenario plans from the call's own inputs, which advance with each save, so the head
  // moving under it (the app adopting Max's last save and autosaving it) isn't a conflict. Outside a
  // call, the head moving means the student changed their plan elsewhere: re-check first (spec 06).
  const callScoped = scenario.callId !== null && (await callHasInputs(scenario.callId))
  if (!alreadyCommitted && !callScoped && plan.version !== scenario.baseVersion) {
    return err('STALE', 'Your plan changed since we looked at this — want me to run it again on the current version?')
  }

  const validation = scenario.validation as unknown as ValidationResult
  if (!validation.ok) return err('VALIDATION_FAILED', "That change isn't valid yet, so I can't save it as is.")

  const ops = scenario.operations as unknown as ScenarioOp[]

  if (confirmation.channel === 'voice') {
    const affirmative = checkAffirmative(confirmation.utterance ?? '')
    if (!affirmative.ok) return err('AMBIGUOUS_CONFIRMATION', 'I want to make sure before I save this — was that a yes?')
  }

  const ri = scenario.resultInputs as unknown as ResultInputs
  const terms = scenario.resultTerms as unknown as PlannedTerm[]
  const snapshot: PlanSnapshot = {
    targetProgramId: ri.targetProgramId,
    minorProgramId: ri.minorProgramId ?? null,
    targetSpecializationIds: ri.targetSpecializationIds,
    coursesPerTerm: ri.coursesPerTerm,
    // A scenario computed before these existed (v2) planned without Spring/Summer.
    springSummer: ri.springSummer ?? false,
    summerPerTerm: ri.summerPerTerm ?? DEFAULT_SUMMER_COURSES,
    startSeason: ri.startSeason,
    startYear: ri.startYear,
    terms,
    validation,
  }
  const live = { scenarioId: String(scenarioId), inputs: liveInputsOf(ri), terms }

  // A saved pace or summer change is the student's preference now (spec 03: SET_PREFERENCE sets both) —
  // except a guest's: the demo student is every guest's, and its profile would become the next one's.
  const savesPreference = ops.some((o) => o.op === 'SET_PREFERENCE') && !(await isSharedGuest(userId))

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
          after: terms as unknown as Prisma.InputJsonValue,
          callId: scenario.callId ?? null,
          scenarioId,
        },
      }),
      ...(savesPreference
        ? [
            db().studentProfile.updateMany({
              where: { userId },
              data: { maxCoursesPerTerm: ri.coursesPerTerm, springSummer: ri.springSummer, maxSummerCourses: ri.summerPerTerm },
            }),
          ]
        : []),
    ])
    if (scenario.callId !== null) await advanceCall(scenario.callId, ri, terms)
    return { ok: true, versionId: String((version as { planVersionId: bigint }).planVersionId), undoAvailable: true, live }
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      const existing = await db().planVersion.findUnique({ where: { scenarioId } })
      if (existing) return { ok: true, versionId: String(existing.planVersionId), undoAvailable: true, live }
    }
    throw e
  }
}

async function callHasInputs(callId: bigint): Promise<boolean> {
  const call = await db().maxCall.findUnique({ where: { callId }, select: { planInputs: true } })
  return call?.planInputs !== null && call?.planInputs !== undefined
}
