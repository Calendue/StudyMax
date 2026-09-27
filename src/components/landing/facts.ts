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
  /** Courses whose catalogue prerequisites StudyMax has, so it can put them in order. */
  prerequisites: count(Object.values(courseInfo).filter((c) => c.prerequisiteText.length > 0).length),
  /** Requirement sets StudyMax plans against: specializations, majors' degree paths, certificates and minors. */
  paths: count(programs.reduce((n, p) => n + p.specializations.length, 0)),
  awards: count(usask.resources.length),
}

/**
 * A credential's name as the app has it: a certificate or minor by its program id, or a
 * specialization or degree path by its program and its own id, labelled with the program.
 */
export function credentialName(programId: string, specId?: string): { name: string; kind: string } {
  const program = programs.find((p) => p.id === programId)
  if (!program) return { name: specId ?? programId, kind: '' }
  if (program.kind === 'certificate' || program.kind === 'minor')
    return { name: program.name.replace(/^Certificate in /, '').replace(/ Minor$/, ''), kind: program.kind === 'minor' ? 'Minor' : 'Certificate' }
  const spec = program.specializations.find((x) => x.id === specId)
  return { name: spec?.name ?? program.name, kind: program.name.replace(/ and Bioresources$/, '') }
}

export function courseTitle(code: string): string {
  return courseInfo[code]?.title ?? computerScience.courseTitles[code] ?? code
}

/** The catalogue's own prerequisites for a course, flattened: every course that can satisfy one. */
export function prerequisitesOf(code: string): Set<string> {
  return new Set((courseInfo[code]?.requires ?? []).flat())
}
