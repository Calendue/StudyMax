// What Max knows about the course catalogue on a call: the real courses that can fill each elective
// slot in the plan (the same rules as the app's elective picker), and the catalogue course a spoken or
// misheard code means ("ENGL 110", "comp sci 214"). Pure; runs server-side, so `.js` imports.
import { activeCourses } from '../../data/activeCourses.js'
import { catalogueCourses, type CatalogueCourse } from '../../data/courses.js'
import type { Degree } from '../../data/degrees/types.js'
import { electiveCandidates } from '../electiveChoices.js'
import { electiveLabel, isElective, type PlannedTerm } from '../plan.js'

const TITLES = new Map(catalogueCourses.map((c) => [c.code, c.title]))

/** "CMPT 318 — Data Analytics", the way Max reads a course out. */
export function courseLine(code: string): string {
  const title = TITLES.get(code)
  return title ? `${code.replace(/^([A-Z]+)(\d)/, '$1 $2')} — ${title}` : code
}

// Subjects as students and speech-to-text say them, to the catalogue's own codes.
const SUBJECT_ALIASES: Record<string, string> = {
  ENGL: 'ENG',
  ENGLISH: 'ENG',
  COMP: 'CMPT',
  COMPSCI: 'CMPT',
  CS: 'CMPT',
  CMP: 'CMPT',
  MATHS: 'MATH',
  MAT: 'MATH',
  STATS: 'STAT',
  STATISTICS: 'STAT',
  PHYSICS: 'PHYS',
  PHY: 'PHYS',
  CHEMISTRY: 'CHEM',
  BIOLOGY: 'BIOL',
  BIO: 'BIOL',
  PSYCH: 'PSY',
  PSYC: 'PSY',
  PHILOSOPHY: 'PHIL',
  ECONOMICS: 'ECON',
  ECO: 'ECON',
  HISTORY: 'HIST',
  SOCIOLOGY: 'SOC',
  INDIGENOUS: 'INDG',
}

/** The catalogue code a spoken code means, or up to three real courses it might have been. */
export function resolveCourse(raw: string): { code: string } | { suggestions: string[] } {
  const compact = raw.toUpperCase().replace(/[^A-Z0-9]/g, '')
  const m = compact.match(/^([A-Z]+)(\d{3})/)
  if (activeCourses.has(compact)) return { code: compact }
  if (m) {
    const aliased = `${SUBJECT_ALIASES[m[1]] ?? m[1]}${m[2]}`
    if (activeCourses.has(aliased)) return { code: aliased }
  }
  const num = m?.[2]
  const subject = m ? (SUBJECT_ALIASES[m[1]] ?? m[1]) : ''
  const near = catalogueCourses.filter(
    (c) => activeCourses.has(c.code) && ((num && c.code.endsWith(num)) || (subject && c.code.startsWith(subject) && num && c.code.slice(subject.length, subject.length + 1) === num[0])),
  )
  // Same subject first, then the same number in another subject.
  near.sort((a, b) => Number(b.code.startsWith(subject)) - Number(a.code.startsWith(subject)) || (a.code < b.code ? -1 : 1))
  return { suggestions: near.slice(0, 3).map((c) => courseLine(c.code)) }
}

export interface ElectiveOptions {
  term: string
  slot: string
  /** Real courses that fit the slot and can be taken that term, as "CODE — Title". */
  options: string[]
}

/** For every open elective slot in the plan: real courses that fill it, the program's own subjects first. */
export function electiveOptions(
  terms: PlannedTerm[],
  degree: Degree | undefined,
  completed: Iterable<string>,
  prefer: string[],
  limit = 14,
): ElectiveOptions[] {
  const done = new Set(completed)
  const rank = (c: CatalogueCourse) => {
    const i = prefer.findIndex((s) => c.code.startsWith(s))
    return i < 0 ? prefer.length : i
  }
  // Each slot leads with courses no earlier slot offered, so "pick all my electives" gets different ones.
  const offered = new Set<string>()
  return terms.flatMap((t) =>
    t.courses
      .filter((c) => isElective(c.code))
      .map((c) => {
        const fits = electiveCandidates({ slot: c.code, degree, roadmap: terms, completed: done, picks: {} })
        const sorted = [...fits].sort(
          (a, b) => Number(offered.has(a.code)) - Number(offered.has(b.code)) || rank(a) - rank(b) || (a.code < b.code ? -1 : 1),
        )
        // A spread of subjects, not the first eight of one: Max matches them to what the student likes.
        const bySubject = new Map<string, CatalogueCourse[]>()
        for (const x of sorted) {
          const subj = x.code.match(/^[A-Z]+/)?.[0] ?? ''
          bySubject.set(subj, [...(bySubject.get(subj) ?? []), x])
        }
        const picked: CatalogueCourse[] = []
        for (let round = 0; picked.length < limit && round < 3; round++) {
          for (const list of bySubject.values()) if (picked.length < limit && list[round]) picked.push(list[round])
        }
        picked.slice(0, 2).forEach((x) => offered.add(x.code))
        return { term: t.label, slot: electiveLabel(c.code), options: picked.map((x) => courseLine(x.code)) }
      }),
  )
}
