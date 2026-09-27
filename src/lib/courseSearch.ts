import { catalogueCourses, type CatalogueCourse } from '../data/courses.ts'

export interface CourseHit extends CatalogueCourse {
  score: number
}

/** "CMPT 280" / "cmpt-280" / "cmpt280" all normalize to the same thing. */
function normalizeCode(text: string): string {
  return text.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

function words(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
}

/**
 * Scores one course against a query. Higher is better; 0 means no match.
 *
 * The ordering that matters, highest first: an exact course code, a code the query is the start of,
 * a title starting with the query, a title containing every query word, a title containing some of
 * them. Within a tier, lower course numbers win — a student typing "cmpt 2" is far likelier to want
 * CMPT 214 than CMPT 280's fourth-year cousin.
 */
export function scoreCourse(query: string, course: CatalogueCourse): number {
  const code = normalizeCode(query)
  const queryWords = words(query)
  if (code.length === 0) return 0

  if (course.code === code) return 1000
  if (course.code.startsWith(code)) return 900
  // "280" on its own should still find CMPT 280.
  if (/^\d+$/.test(code) && course.code.endsWith(code)) return 850

  const title = course.title.toLowerCase()
  const phrase = queryWords.join(' ')
  if (phrase.length > 0 && title.startsWith(phrase)) return 800
  if (phrase.length > 0 && title.includes(phrase)) return 700

  const titleWords = words(course.title)
  const hits = queryWords.filter((word) => titleWords.some((t) => t.startsWith(word)))
  if (hits.length === queryWords.length) return 600
  // A single stray word match is noise; require most of the query to land.
  if (hits.length > 0 && hits.length >= queryWords.length - 1) return 400 + hits.length

  return 0
}

/** Best matches for a typed query, closest first. Empty query yields nothing. */
export function searchCourses(
  query: string,
  limit = 8,
  courses: CatalogueCourse[] = catalogueCourses,
): CourseHit[] {
  if (query.trim().length === 0) return []

  const hits: CourseHit[] = []
  for (const course of courses) {
    const score = scoreCourse(query, course)
    if (score > 0) hits.push({ ...course, score })
  }

  return hits
    .sort(
      (a, b) =>
        b.score - a.score ||
        Number(a.code.replace(/^[A-Z]+/, '')) - Number(b.code.replace(/^[A-Z]+/, '')) ||
        a.code.localeCompare(b.code),
    )
    .slice(0, limit)
}

const titlesByCode = new Map(catalogueCourses.map((c) => [c.code, c.title]))

/** Catalogue title for a code, or undefined if the catalogue doesn't list it. */
export function catalogueTitle(code: string): string | undefined {
  return titlesByCode.get(code)
}

/** The catalogue's own search page. Always live, so it is the safe landing spot. */
export const CATALOGUE_HOME = 'https://catalogue.usask.ca/'

/**
 * The catalogue's public page for a course, e.g. CMPT384 -> catalogue.usask.ca/CMPT-384.
 * That URL shape is the catalogue's own: it links courses to itself this way.
 *
 * Codes the catalogue no longer lists (retired courses that survive in a program page's prose, or
 * in a prerequisite line) 404 at that address, so they fall back to the catalogue's search page —
 * a student following a link never lands on a dead one.
 */
export function catalogueUrl(code: string): string {
  if (!titlesByCode.has(code)) return CATALOGUE_HOME
  return `https://catalogue.usask.ca/${code.replace(/^([A-Z]+)(\d+)$/, '$1-$2')}`
}
