// The course data the planner reads, as one Catalog (src/lib/planner/types.ts): prerequisites,
// credit rules, antirequisites, credit units, the seasons each course runs in with how sure that is,
// and full-year courses. Built once from src/data; the planner core never imports data itself.
//
// Sources, in order of trust: live Banner (offerings.ts, then SEASON_OVERRIDES and the per-term
// history in offeringConfidence.ts), then the catalogue's `offered`. Hand-fixed prerequisites
// (prereqOverrides.ts) win over the scraper's parse.

import { courseInfo } from '../data/prereqs.js'
import { creditPrereqs } from '../data/creditPrereqs.js'
import { offerings } from '../data/offerings.js'
import { SEASON_OVERRIDES, historySeasons, judgeOffering } from '../data/offeringConfidence.js'
import { prereqOverrides } from '../data/prereqOverrides.js'
import { courseCu } from './degree.js'
import type { Catalog, CatalogCourse, Season } from './planner/types.js'

/** The catalogue's `offered` as seasons (a full-year course starts in Fall). */
const CATALOGUE_SEASONS: Record<string, Season[]> = {
  fall: ['Fall'],
  winter: ['Winter'],
  either: ['Fall', 'Winter'],
  'full-year': ['Fall'],
  'spring-summer': ['Spring/Summer'],
}

const nonEmpty = (groups: string[][] | undefined) => (groups ?? []).filter((g) => g.length > 0).map((g) => [...g])

/** Banner's seasons for a course: offerings.ts, then a hand override, then the per-term history. */
function bannerSeasons(code: string): Season[] {
  const scraped = offerings[code] ?? []
  if (scraped.length > 0) return [...scraped]
  const override = SEASON_OVERRIDES[code] ?? []
  if (override.length > 0) return [...override]
  return historySeasons(code)
}

let cached: Catalog | null = null

/** The USask catalogue: Banner's seasons beat the catalogue's `offered`; neither → unknown ([]). */
export function defaultCatalog(): Catalog {
  if (cached) return cached
  const out: Record<string, CatalogCourse> = {}
  for (const code of Object.keys(courseInfo).sort()) {
    const info = courseInfo[code]
    const fix = prereqOverrides[code]
    const banner = bannerSeasons(code)
    const catalogue = CATALOGUE_SEASONS[info.offered ?? ''] ?? []
    const seasons = banner.length > 0 ? banner : [...catalogue]
    const { confidence, atRisk } = judgeOffering(code, banner.length > 0, catalogue.length > 0)
    const course: CatalogCourse = {
      cu: courseCu(code),
      requires: nonEmpty(fix?.requires ?? info.requires),
      concurrent: nonEmpty(fix?.concurrent ?? info.concurrent),
      credit: [...(creditPrereqs[code] ?? []), ...(info.creditRequires ?? [])],
      antirequisites: [...(fix?.antirequisites ?? info.antirequisites ?? [])],
      seasons,
      confidence,
      // "Term 1 and 2" in the catalogue, unless Banner has it in one term only (KIN 382 runs in
      // Winter, KIN 451 in Spring/Summer): a two-term course needs a Fall and a Winter section.
      fullYear: info.offered === 'full-year' && seasons.includes('Fall') && (banner.length === 0 || banner.includes('Winter')),
    }
    if (fix?.minGrade) course.minGrade = { ...fix.minGrade }
    if (atRisk) course.atRisk = true
    out[code] = course
  }
  cached = Object.freeze(out)
  return cached
}
