// The course data the planner reads, as one Catalog (src/lib/planner/types.ts): prerequisites,
// credit rules, antirequisites, credit units, the seasons each course runs in with how sure that is,
// and full-year courses. Built once from src/data; the planner core never imports data itself.

import { courseInfo } from '../data/prereqs.js'
import { creditPrereqs } from '../data/creditPrereqs.js'
import { offerings } from '../data/offerings.js'
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

let cached: Catalog | null = null

/** The USask catalogue: Banner's seasons beat the catalogue's `offered`; neither → unknown ([]). */
export function defaultCatalog(): Catalog {
  if (cached) return cached
  const out: Record<string, CatalogCourse> = {}
  for (const code of Object.keys(courseInfo).sort()) {
    const info = courseInfo[code]
    const banner = offerings[code] ?? []
    const catalogue = CATALOGUE_SEASONS[info.offered ?? ''] ?? []
    out[code] = {
      cu: courseCu(code),
      requires: (info.requires ?? []).filter((g) => g.length > 0),
      concurrent: (info.concurrent ?? []).filter((g) => g.length > 0),
      credit: [...(creditPrereqs[code] ?? []), ...(info.creditRequires ?? [])],
      antirequisites: [...(info.antirequisites ?? [])],
      seasons: banner.length > 0 ? [...banner] : [...catalogue],
      confidence: banner.length > 0 ? 'published' : catalogue.length > 0 ? 'catalogue-only' : 'unknown',
      fullYear: info.offered === 'full-year',
    }
  }
  cached = Object.freeze(out)
  return cached
}
