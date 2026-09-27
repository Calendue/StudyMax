import type { Resource } from '../data/schools/types.ts'
import type { TargetKind } from '../format.ts'
import { courseCode } from '../format.ts'
import { withoutRegistered, type CourseOverlap, type SpecializationMatch } from './match.ts'
import { daysUntil } from './resources.ts'

// WHAT THE WIDGETS AND THE DEADLINE WATCH READ. The app writes this through the StudyMaxWidgets
// plugin (src/widgets.ts), and the iOS extension and the Android widgets parse this exact shape, so a
// change here is a change on all three: bump `v`. Lock screens are public, so it carries nothing about
// the student beyond what the widgets show.

export interface WidgetDeadline {
  id: string
  name: string
  value: string | null
  /** YYYY-MM-DD. The award closes at 23:59:59 local time that day, as in daysUntil(). */
  dueDate: string
  url: string
}

export interface WidgetCredential {
  name: string
  kind: TargetKind
  done: number
  total: number
  left: number
  /** The course to take next toward it; null once it's finished. */
  nextCourse: { code: string; title: string } | null
}

export interface WidgetSnapshot {
  v: 1
  updatedAt: string
  deadline: WidgetDeadline | null
  credential: WidgetCredential | null
}

export interface SnapshotInput {
  /** Nothing is shown until the student has seen their own results. */
  revealed: boolean
  /** The school's awards, soonest first (rankByUrgency). */
  awards: Resource[]
  /** The credential the results lead with; null (or an empty match) when there isn't one. */
  hero: SpecializationMatch | null
  heroKind: TargetKind
  /** The course that advances the most specializations at once, if any. */
  topOverlap: CourseOverlap | null
  /** Courses under way or registered for: never offered as the next course. */
  inProgress?: string[]
  courseTitle: (code: string) => string | undefined
  now: Date
}

export function buildWidgetSnapshot(input: SnapshotInput): WidgetSnapshot | null {
  if (!input.revealed) return null

  // The soonest award with a real date still ahead. Rolling, unlisted and passed ones can't count down.
  const award = input.awards.find((r) => daysUntil(r, input.now) !== null)
  const deadline: WidgetDeadline | null =
    award && award.deadlineDate
      ? { id: award.id, name: award.name, value: award.value ?? null, dueDate: award.deadlineDate, url: award.url }
      : null

  const hero = input.hero
  const credential: WidgetCredential | null =
    hero && hero.spec.id && hero.totalRequired > 0
      ? {
          name: hero.spec.name,
          kind: input.heroKind,
          done: hero.doneCount,
          total: hero.totalRequired,
          left: hero.remaining,
          nextCourse: nextCourseFor(hero, input.topOverlap, input.inProgress ?? [], input.courseTitle),
        }
      : null

  if (!deadline && !credential) return null
  return { v: 1, updatedAt: input.now.toISOString(), deadline, credential }
}

/**
 * The overlap course when it also counts toward this credential (one course, two jobs), otherwise
 * the first course of the credential's first open requirement.
 */
function nextCourseFor(
  hero: SpecializationMatch,
  topOverlap: CourseOverlap | null,
  inProgress: string[],
  courseTitle: (code: string) => string | undefined,
): WidgetCredential['nextCourse'] {
  const code = heroNextCourse(hero, topOverlap, [], inProgress)
  if (!code) return null
  return { code: courseCode(code), title: courseTitle(code) ?? '' }
}

/**
 * The next course for the hero, always one of its own open requirements so it never contradicts
 * "What's left" (and never one already registered for): the overlap course when it counts here
 * too, else the first of these the plan schedules (prerequisite order), else the first open option.
 */
export function heroNextCourse(
  hero: SpecializationMatch,
  topOverlap: CourseOverlap | null,
  planOrder: string[] = [],
  inProgress: string[] = [],
): string | null {
  if (hero.remaining === 0) return null
  const open = withoutRegistered(hero.unsatisfied, inProgress).left.flatMap((g) => g.options)
  if (topOverlap && open.includes(topOverlap.course)) return topOverlap.course
  return planOrder.find((c) => open.includes(c)) ?? open[0] ?? null
}
