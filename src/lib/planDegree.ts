import type { Degree } from '../data/programs/types.js'
import type { RequirementGroup } from '../data/specializations.js'
import { courseInfo } from '../data/prereqs.js'
import { computeMatches } from './match.js'

// The planner's one degree-dependent part: which unnamed slots and free electives the degree still
// needs once the named plan is counted, the advising year and label of the requirement a named
// course fills, and whether it is an Honours degree. Written against the count-based Degree
// (src/data/programs/types.ts); moving the planner onto the credit-unit model (src/lib/degree.ts)
// means rewriting planDegree() below, and nothing else in plan.ts reads the degree.

export const FREE_ELECTIVE = 'Free elective'
export const SENIOR_ELECTIVE = 'Senior elective (200-level or higher)'

/** An unnamed slot the plan still has to schedule. */
export interface DegreeSlot {
  label: string
  /** The advising year of its requirement; free electives get theirs from the planner. */
  year?: number
  /** The lowest course level that can fill it (3 for "Senior CMPT elective"): gates when it's planned. */
  level: number
  /** Filled by a 300/400-level CMPT course, so it counts toward the three-a-term senior CMPT limit. */
  seniorCmpt: boolean
  /** Free elective: C5 room, not a named requirement. */
  free: boolean
}

export interface PlanDegree {
  /** The advising year of the requirement a named course fills, when the degree lists it. */
  yearOf(code: string): number | undefined
  /** The requirement a named course is shown under ("English writing"), when it has a label. */
  groupOf(code: string): string | undefined
  /** Unnamed slots still open once `taken` (completed, booked and planned) is counted, then free electives to the total. */
  slots(taken: Set<string>): DegreeSlot[]
  honours: boolean
}

/** Credit units: the catalogue's, else 3. Swap for degree.ts courseCu() at merge. */
export const cuOf = (code: string) => courseInfo[code]?.creditUnits ?? 3
export const levelOf = (code: string) => Number(code.match(/(\d)/)?.[1] ?? 9)

function slotShape(group: RequirementGroup): Pick<DegreeSlot, 'level' | 'seniorCmpt'> {
  const levels = group.courses.map(levelOf)
  const level = levels.length > 0 ? Math.min(...levels) : 1
  const seniorCmpt = level >= 3 && group.courses.every((c) => /^(CMPT|CME)\d/.test(c))
  return { level, seniorCmpt }
}

export function planDegree(degree: Degree): PlanDegree {
  // Named groups first, so a course on two lists takes the year of the one it's asked for by name.
  const ordered = [...degree.requirements.filter((g) => !g.label), ...degree.requirements.filter((g) => g.label)]
  const groupFor = (code: string) => ordered.find((g) => g.courses.includes(code))
  const byLabel = new Map(degree.requirements.filter((g) => g.label).map((g) => [g.label!, g]))

  return {
    honours: /honours/i.test(`${degree.id} ${degree.name}`),
    yearOf: (code) => groupFor(code)?.year,
    groupOf: (code) => groupFor(code)?.label,
    slots(taken) {
      const out: DegreeSlot[] = []
      // Unsatisfied slots come back in the degree's order, so walk its groups alongside them: two
      // groups can share a label (Junior science in Year 1 and Year 2).
      let at = 0
      for (const slot of computeMatches([degree], taken)[0].unsatisfied) {
        if (!slot.label) continue
        while (at < degree.requirements.length && degree.requirements[at].label !== slot.label) at++
        const group = degree.requirements[at++] ?? byLabel.get(slot.label)
        if (!group) continue
        for (let i = 0; i < slot.need; i++) out.push({ label: slot.label!, year: group.year, ...slotShape(group), free: false })
      }
      // C5: whatever brings the degree to its credit total. Every course taken or planned counts,
      // including ones no slot uses (a prerequisite the degree doesn't list, an outside course).
      const takenCu = [...taken].reduce((n, c) => n + cuOf(c), 0)
      const free = Math.max(0, Math.ceil((degree.totalCourses * 3 - takenCu - out.length * 3) / 3))
      // "...of which at least 66 must be at the 200-level or higher": label enough of them senior.
      const seniorCu =
        [...taken].filter((c) => levelOf(c) >= 2).reduce((n, c) => n + cuOf(c), 0) +
        out.filter((s) => s.level >= 2).length * 3
      const senior = Math.ceil(Math.max(0, (degree.minSeniorCu ?? 0) - seniorCu) / 3)
      for (let i = 0; i < Math.max(free, senior); i++) {
        const isSenior = i < senior
        out.push({ label: isSenior ? SENIOR_ELECTIVE : FREE_ELECTIVE, level: isSenior ? 2 : 1, seniorCmpt: false, free: true })
      }
      return out
    },
  }
}
