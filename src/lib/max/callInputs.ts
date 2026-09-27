// Checks the plan inputs the app sends when it places a call (CallPlanInputs, src/lib/max/live.ts).
// They come from the client, so nothing is trusted: an unknown program, a malformed course code or an
// out-of-range load drops the whole thing and the call falls back to the student's saved plan — never
// an error mid-call. Pure, for api/max/call.ts and the check scripts.
import { programs } from '../../data/programs/index.js'
import type { Season } from '../plan.js'
import type { CallPlanInputs } from './live.js'

const CODE_RE = /^[A-Z]{2,5}\d{3}$/
const SEASONS = new Set<Season>(['Fall', 'Winter', 'Spring/Summer'])
const MAX_COURSES = 200

const codes = (v: unknown): string[] | null =>
  Array.isArray(v) && v.length <= MAX_COURSES && v.every((c) => typeof c === 'string' && CODE_RE.test(c)) ? [...new Set(v as string[])] : null

const ids = (v: unknown, max: number): string[] | null =>
  Array.isArray(v) && v.length <= max && v.every((s) => typeof s === 'string' && s.length > 0 && s.length <= 80) ? (v as string[]) : null

const intIn = (v: unknown, min: number, max: number): number | null => (Number.isInteger(v) && (v as number) >= min && (v as number) <= max ? (v as number) : null)

/** The app's plan inputs, or null (with why, for the log) when anything doesn't check out. */
export function parseCallPlanInputs(raw: unknown): { inputs: CallPlanInputs } | { rejected: string } {
  if (!raw || typeof raw !== 'object') return { rejected: 'missing' }
  const r = raw as Record<string, unknown>
  const program = programs.find((p) => p.id === r.programId)
  if (!program || program.specializations.length === 0) return { rejected: 'program' }

  const completed = codes(r.completed)
  const inProgress = codes(r.inProgress)
  if (!completed || !inProgress) return { rejected: 'courses' }

  const seasonsRaw = (r.inProgressSeasons ?? {}) as Record<string, unknown>
  if (typeof seasonsRaw !== 'object' || Array.isArray(seasonsRaw)) return { rejected: 'seasons' }
  const inProgressSeasons: Record<string, Season> = {}
  for (const [code, season] of Object.entries(seasonsRaw)) {
    if (!CODE_RE.test(code) || !SEASONS.has(season as Season)) return { rejected: 'seasons' }
    inProgressSeasons[code] = season as Season
  }

  const targetIds = ids(r.targetIds, 10)
  const concentrationIds = ids(r.concentrationIds ?? [], 10)
  if (!targetIds || !concentrationIds) return { rejected: 'targets' }

  const coursesPerTerm = intIn(r.coursesPerTerm, 1, 7)
  const summerPerTerm = intIn(r.summerPerTerm, 1, 4)
  if (coursesPerTerm === null || summerPerTerm === null || typeof r.springSummer !== 'boolean') return { rejected: 'load' }

  const start = r.start as { season?: unknown; year?: unknown } | undefined
  if (!start || !SEASONS.has(start.season as Season) || intIn(start.year, 2000, 2100) === null) return { rejected: 'start' }

  if (typeof r.today !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(r.today)) return { rejected: 'today' }
  const minorId = r.minorId === null || r.minorId === undefined ? null : typeof r.minorId === 'string' ? r.minorId : undefined
  const degreeVariant = r.degreeVariant === null || r.degreeVariant === undefined ? null : typeof r.degreeVariant === 'string' ? r.degreeVariant : undefined
  const away = r.away === null || r.away === undefined ? null : intIn(r.away, 2000, 2100)
  if (minorId === undefined || degreeVariant === undefined || (r.away !== null && r.away !== undefined && away === null)) return { rejected: 'extras' }

  return {
    inputs: {
      v: 1,
      programId: program.id,
      completed,
      inProgress,
      inProgressSeasons,
      targetIds,
      concentrationIds,
      minorId,
      degreeVariant,
      away,
      coursesPerTerm,
      springSummer: r.springSummer,
      summerPerTerm,
      start: { season: start.season as Season, year: start.year as number },
      today: r.today,
      planHash: typeof r.planHash === 'string' ? r.planHash.slice(0, 20_000) : '',
    },
  }
}
