// How sure the planner can be that a course runs, and the sections offerings.ts misses. Read by
// src/lib/catalog.ts; pure data and pure functions, no dates read at runtime.
//
// Precedence (Banner beats the catalogue):
// 1. Seasons: offerings.ts (Banner 2025-27), then SEASON_OVERRIDES below (live Banner sections the
//    scraper missed), then the Banner history (bannerHistory.ts, CMPT/MATH/STAT since Fall 2024),
//    then the catalogue's `offered`.
// 2. Confidence, for CMPT/MATH/STAT, from the Banner history's cadence:
//    'published'           a section in the latest year of data (Fall 2026, Winter 2027, or
//                          Spring/Summer 2026, since Spring/Summer 2027 isn't out yet);
//    'annual-pattern'      none in the latest year, but one in each earlier year (CMPT 394, 438);
//    'alternating-pattern' none in the latest year and only some earlier years (CMPT 432, 433, 442);
//    and a course with no section in any of the ten terms is at risk (CMPT 440, MATH 314, 436,
//    438), with the catalogue's word for its seasons ('catalogue-only', or 'unknown' when the
//    catalogue is silent too). Other subjects: in offerings.ts (or an override) is 'published',
//    the catalogue alone is 'catalogue-only', neither is 'unknown'.

import type { OfferingConfidence, Season } from '../lib/planner/types.js'
import { BANNER_HISTORY_SUBJECTS, BANNER_HISTORY_TERMS, bannerHistory } from './bannerHistory.js'

/**
 * Live Banner sections src/data/offerings.ts misses (checked per term, Fall 2024 to Winter 2027):
 * CMPT 400, 405 and 407 run every Fall and Winter, CMPT 401-404 every term, CMPT 498 ran Winter
 * 2026. These win over the catalogue (which has CMPT 400/405 as full-year and 401-404/407 as none).
 */
export const SEASON_OVERRIDES: Record<string, Season[]> = {
  CMPT400: ['Fall', 'Winter'],
  CMPT401: ['Fall', 'Winter', 'Spring/Summer'],
  CMPT402: ['Fall', 'Winter', 'Spring/Summer'],
  CMPT403: ['Fall', 'Winter', 'Spring/Summer'],
  CMPT404: ['Fall', 'Winter', 'Spring/Summer'],
  CMPT405: ['Fall', 'Winter'],
  CMPT407: ['Fall', 'Winter'],
  CMPT498: ['Winter'],
}

const SEASON_ORDER: Season[] = ['Fall', 'Winter', 'Spring/Summer']

/** '202609' → Fall; '202701' → Winter; '202605'/'202607' → Spring/Summer. */
export function seasonOfTerm(term: string): Season {
  const month = term.slice(4)
  return month === '09' ? 'Fall' : month === '01' ? 'Winter' : 'Spring/Summer'
}

/** The academic year a Banner term belongs to, by its Fall's calendar year (Winter 2027 → 2026). */
export function academicYearOfTerm(term: string): number {
  const year = Number(term.slice(0, 4))
  return term.slice(4) === '09' ? year : year - 1
}

const LATEST_TERM = BANNER_HISTORY_TERMS[BANNER_HISTORY_TERMS.length - 1]
const LATEST_YEAR = academicYearOfTerm(LATEST_TERM)
const FIRST_YEAR = academicYearOfTerm(BANNER_HISTORY_TERMS[0])
/** The newest Spring/Summer in the data ('2026'): part of the latest year's published schedule. */
const LATEST_SUMMER = (BANNER_HISTORY_TERMS.filter((t) => seasonOfTerm(t) === 'Spring/Summer').at(-1) ?? '').slice(0, 4)
const inLatestSummer = (t: string) => seasonOfTerm(t) === 'Spring/Summer' && t.slice(0, 4) === LATEST_SUMMER

const subjectOf = (code: string) => code.replace(/\d.*$/, '')

/** True when the Banner history covers this course's subject (CMPT, MATH, STAT). */
export function inBannerHistory(code: string): boolean {
  return (BANNER_HISTORY_SUBJECTS as readonly string[]).includes(subjectOf(code))
}

/** The seasons the Banner history saw a course in, in calendar order; [] when it never ran. */
export function historySeasons(code: string): Season[] {
  const seen = new Set((bannerHistory[code] ?? []).map(seasonOfTerm))
  return SEASON_ORDER.filter((s) => seen.has(s))
}

/** Special topics and independent study (x98/x99): arranged per student, rarely in class search. */
const arranged = (code: string) => /9[89]$/.test(code)

export interface OfferingJudgement {
  confidence: OfferingConfidence
  /** No section in the three years of Banner data. */
  atRisk: boolean
}

/**
 * How sure we are, given which source supplied the seasons. `fromBanner` is true when offerings.ts
 * or SEASON_OVERRIDES gave them; `fromCatalogue` when only the catalogue did.
 */
export function judgeOffering(code: string, fromBanner: boolean, fromCatalogue: boolean): OfferingJudgement {
  if (inBannerHistory(code)) {
    const terms = bannerHistory[code] ?? []
    if (terms.length === 0 && !fromBanner) {
      return { confidence: fromCatalogue ? 'catalogue-only' : 'unknown', atRisk: !arranged(code) }
    }
    const latest = terms.some((t) => academicYearOfTerm(t) === LATEST_YEAR || inLatestSummer(t))
    if (latest || (fromBanner && terms.length === 0)) return { confidence: 'published', atRisk: false }
    const years = new Set(terms.map(academicYearOfTerm))
    let every = true
    for (let y = FIRST_YEAR; y < LATEST_YEAR; y++) if (!years.has(y)) every = false
    return { confidence: every ? 'annual-pattern' : 'alternating-pattern', atRisk: false }
  }
  if (fromBanner) return { confidence: 'published', atRisk: false }
  return { confidence: fromCatalogue ? 'catalogue-only' : 'unknown', atRisk: false }
}
