// Every number on the landing page, counted from the app's own data at build time. Nothing here is
// typed in by hand: change the data and the page follows.
import { catalogueCourses } from '../../data/courses.ts'
import { courseInfo } from '../../data/prereqs.ts'
import { programs } from '../../data/programs/index.ts'
import { computerScience } from '../../data/programs/computerScience.ts'
import { usask } from '../../data/schools/usask.ts'

const count = (n: number) => n.toLocaleString('en-CA')

export const FACTS = {
  courses: count(catalogueCourses.length),
  csSpecializations: count(computerScience.specializations.length),
  certificatesAndMinors: count(programs.filter((p) => p.kind === 'certificate' || p.kind === 'minor').length),
  programs: count(programs.length),
  awards: count(usask.resources.length),
  /** Awards whose deadline is published, rather than "Not listed". */
  awardDeadlines: count(usask.resources.filter((r) => !/^not listed/i.test(r.deadline)).length),
}

/** A credential's name as the app has it, by program id (certificates and minors) or CS specialization id. */
export function credentialName(id: string): { name: string; kind: string } {
  const program = programs.find((p) => p.id === id)
  if (program) return { name: program.name.replace(/^Certificate in /, '').replace(/ Minor$/, ''), kind: program.kind === 'minor' ? 'Minor' : 'Certificate' }
  const spec = computerScience.specializations.find((s) => s.id === id)
  return { name: spec?.name ?? id, kind: 'Specialization' }
}

export function courseTitle(code: string): string {
  return courseInfo[code]?.title ?? computerScience.courseTitles[code] ?? code
}

/** The catalogue's own prerequisites for a course, flattened: every course that can satisfy one. */
export function prerequisitesOf(code: string): Set<string> {
  return new Set((courseInfo[code]?.requires ?? []).flat())
}
