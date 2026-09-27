import { courseInfo } from '../data/prereqs.ts'
import { offerings } from '../data/offerings.ts'
import { breadth } from '../data/breadth.ts'
import { catalogueCourses, type CatalogueCourse } from '../data/courses.ts'
import type { Degree } from '../data/degrees/types.ts'
import { courseCu, groupAccepts, TYPED_BREADTH_LABEL } from './degree.ts'
import { electiveLabel, isElective, type PlannedTerm, type Season } from './plan.ts'
import { FREE_ELECTIVE, SENIOR_ELECTIVE } from './planDegree.ts'

// Which real courses can fill one of the plan's unnamed elective slots ("Breadth elective",
// "Senior elective (200-level or higher)") in the term the plan put it. A pick is the student's own
// choice layered over the plan: it fills a slot the plan already counted, so it never changes the
// plan's terms or credit totals, and the planner never sees it.

export interface ElectiveContext {
  /** The slot's code, 'elective:<n>:<label>'. */
  slot: string
  degree: Degree | undefined
  /** The roadmap the slot sits in (completed courses aren't in it). */
  roadmap: PlannedTerm[]
  completed: ReadonlySet<string>
  /** Picks already made for other slots, so one course isn't picked twice. */
  picks: Record<string, string>
}

const number = (code: string) => Number(code.match(/(\d{3})$/)?.[1] ?? 0)
const SEASONS: Season[] = ['Fall', 'Winter', 'Spring/Summer']

function seasonOf(label: string): Season | undefined {
  return SEASONS.find((s) => label.startsWith(s))
}

/** Whether a slot of this label takes this course, by the degree's own rules. */
function fitsSlot(slot: string, code: string, degree: Degree | undefined): boolean {
  const label = electiveLabel(slot)
  const n = number(code)
  if (n < 100 || n >= 500) return false
  // A slot is 3 cu in the plan's totals: a 6 cu course (ENG 110.6) would quietly change them.
  if (courseCu(code) !== 3) return false
  if (label === FREE_ELECTIVE) return true
  if (label === SENIOR_ELECTIVE) return n >= 200
  const group = degree?.groups.find((g) => groupAccepts(g, slot))
  if (!group || !groupAccepts(group, code)) return false
  if (label === TYPED_BREADTH_LABEL && !(breadth[code] ?? []).some((t) => t === 'HUM' || t === 'SOCS')) return false
  // "Junior science: Biology or Chemistry": only the areas still open.
  const narrowedTo = label.startsWith(`${group.label}: `) ? label.slice(group.label.length + 2) : null
  if (narrowedTo && group.areas) {
    const open = Object.entries(group.areas.byArea).filter(([area]) => narrowedTo.includes(area))
    if (open.length > 0 && !open.some(([, codes]) => codes.includes(code))) return false
  }
  return true
}

/**
 * The courses that fit the slot and could really be taken in its term: offered that season, not
 * already taken, planned or picked, no antirequisite taken, and every prerequisite passed by then
 * (completed, in progress, or planned or picked in an earlier term).
 */
export function electiveCandidates(ctx: ElectiveContext): CatalogueCourse[] {
  const termIndex = ctx.roadmap.findIndex((t) => t.courses.some((c) => c.code === ctx.slot))
  if (termIndex < 0) return []
  const season = seasonOf(ctx.roadmap[termIndex].label)

  const real = (code: string) => (isElective(code) ? ctx.picks[code] : code)
  const before = new Set(ctx.completed)
  let cuBefore = [...ctx.completed].reduce((n, c) => n + courseCu(c), 0)
  ctx.roadmap.slice(0, termIndex).forEach((t) =>
    t.courses.forEach((c) => {
      cuBefore += c.cu ?? courseCu(c.code)
      const code = real(c.code)
      if (code) before.add(code)
    }),
  )
  const sameTerm = new Set(ctx.roadmap[termIndex].courses.map((c) => real(c.code)).filter((c): c is string => !!c))
  const unavailable = new Set([
    ...ctx.completed,
    ...ctx.roadmap.flatMap((t) => t.courses.map((c) => c.code)),
    ...Object.entries(ctx.picks)
      .filter(([slot]) => slot !== ctx.slot)
      .map(([, code]) => code),
  ])

  return catalogueCourses.filter(({ code }) => {
    if (unavailable.has(code) || !fitsSlot(ctx.slot, code, ctx.degree)) return false
    if (season && !(offerings[code] ?? []).includes(season)) return false
    const info = courseInfo[code]
    if (!info) return true
    if (info.antirequisites?.some((a) => before.has(a) || sameTerm.has(a))) return false
    if (!info.requires.every((options) => options.some((o) => before.has(o)))) return false
    if (info.concurrent && !info.concurrent.every((options) => options.some((o) => before.has(o) || sameTerm.has(o)))) return false
    for (const need of info.creditRequires ?? []) {
      if (need.standing) return false
      const counted = [...before].filter(
        (c) =>
          (!need.subjects || need.subjects.some((s) => c.startsWith(s))) &&
          (!need.level || Math.floor(number(c) / 100) * 100 === need.level),
      )
      const cu = need.subjects || need.level ? counted.reduce((n, c) => n + courseCu(c), 0) : cuBefore
      if (cu < need.cu) return false
    }
    return true
  })
}
