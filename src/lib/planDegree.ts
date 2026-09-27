import type { Degree, DegreeGroup } from '../data/degrees/types.js'
import type { Specialization } from '../data/specializations.js'
import { auditDegree, courseCu, groupAccepts, TYPED_BREADTH_LABEL } from './degree.js'

// The planner's one degree-dependent part, on the credit-unit model (src/data/degrees, audited by
// src/lib/degree.ts): which unnamed slots and free electives the degree still needs once the named
// plan is counted, the advising year and requirement of a named course, and whether it's Honours.

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
  /** The requirement a named course is shown under ("Core CMPT"). */
  groupOf(code: string): string | undefined
  /** Unnamed slots still open once `taken` (completed, booked and planned) is counted, then free electives to the total. */
  slots(taken: Set<string>): DegreeSlot[]
  honours: boolean
}

/** Credit units, from the degree audit's own reckoning (ENG 110.6 is 6, MATH 133.4 is 4). */
export const cuOf = courseCu
export const levelOf = (code: string) => Number(code.match(/(\d)/)?.[1] ?? 9)

const targets = new WeakMap<Degree, Specialization>()
/**
 * The degree as a planning target: its named requirements as course-count groups, so the planner
 * names CMPT 214 and the core the same way it names a specialization's courses. Open requirements
 * keep their label (they're planned as unnamed slots, never picked). Cached per degree.
 */
export function degreeTarget(degree: Degree): Specialization {
  let target = targets.get(degree)
  if (!target) {
    target = {
      id: degree.id,
      name: degree.name,
      requirements: degree.groups.map((g) => ({
        courses: g.courses,
        need: Math.max(1, Math.ceil(g.needCu / 3)),
        ...(g.open ? { label: g.label } : {}),
        ...(g.year ? { year: g.year } : {}),
        ...(g.prefer ? { prefer: g.prefer } : {}),
      })),
    }
    targets.set(degree, target)
  }
  return target
}

/** The smallest level of course that fills an open group, and whether it's a senior CMPT seat. */
function slotShape(group: DegreeGroup): Pick<DegreeSlot, 'level' | 'seniorCmpt'> {
  if (/410 or higher/i.test(group.label)) return { level: 4, seniorCmpt: true }
  if (/senior cmpt/i.test(group.label)) return { level: 3, seniorCmpt: true }
  const levels = group.courses.map(levelOf)
  return { level: levels.length > 0 ? Math.min(...levels) : 1, seniorCmpt: false }
}

/** "Junior science: Biology, Chemistry or Earth Science" once one area has its 6 cu. */
function narrowed(group: DegreeGroup, counted: string[]): string {
  if (!group.areas) return group.label
  const { capCu, byArea } = group.areas
  const full = Object.entries(byArea).filter(([, codes]) => counted.filter((c) => codes.includes(c)).reduce((n, c) => n + courseCu(c), 0) >= capCu)
  if (full.length === 0) return group.label
  const open = Object.keys(byArea).filter((a) => !full.some(([f]) => f === a))
  return open.length === 0 ? group.label : `${group.label}: ${open.length === 1 ? open[0] : `${open.slice(0, -1).join(', ')} or ${open.at(-1)}`}`
}

export function planDegree(degree: Degree): PlanDegree {
  // Named groups first, so a course on two lists takes the year of the one it's asked for by name.
  const ordered = [...degree.groups.filter((g) => !g.open), ...degree.groups.filter((g) => g.open)]
  const groupFor = (code: string) => ordered.find((g) => groupAccepts(g, code))

  return {
    honours: degree.variant === 'bsc-honours',
    yearOf: (code) => groupFor(code)?.year,
    groupOf: (code) => groupFor(code)?.label,
    slots(taken) {
      const audit = auditDegree(degree, taken)
      const out: (DegreeSlot & { flexible: boolean })[] = []
      for (const progress of audit.groups) {
        const group = progress.group
        if (!group.open || progress.remainingCu <= 0) continue
        const count = Math.ceil(progress.remainingCu / 3)
        const typed = Math.ceil((progress.typeRemainingCu ?? 0) / 3)
        const label = narrowed(group, progress.courses)
        // The year tag covers the first `yearCu` of the group; what's left of it falls a year later.
        const inYear = group.yearCu === undefined ? count : Math.max(0, Math.ceil((group.yearCu - progress.cu) / 3))
        for (let i = 0; i < count; i++) {
          out.push({
            label: i < typed ? TYPED_BREADTH_LABEL : label,
            ...(group.year ? { year: i < inYear ? group.year : group.year + 1 } : {}),
            ...slotShape(group),
            free: false,
            flexible: Boolean(group.flexible),
          })
        }
      }
      // A flexible slot yields its year's seat to the others: it goes last among its year's slots.
      out.sort((a, b) => (a.year ?? 9) - (b.year ?? 9) || Number(a.flexible) - Number(b.flexible))

      // C5: whatever brings the degree to its credit total, with enough of it at the 200 level or
      // higher for the senior minimum. Open slots count 3 cu each; the 410+ and senior CMPT ones
      // are senior.
      const slotCu = out.length * 3
      const seniorSlotCu = out.filter((s) => s.level >= 2).length * 3
      const free = Math.ceil(Math.max(0, audit.remainingCu - slotCu) / 3)
      const senior = Math.ceil(Math.max(0, audit.remainingSeniorCu - seniorSlotCu) / 3)
      const slots: DegreeSlot[] = out.map(({ flexible: _, ...slot }) => slot)
      for (let i = 0; i < Math.max(free, senior); i++) {
        const isSenior = i < senior
        slots.push({ label: isSenior ? SENIOR_ELECTIVE : FREE_ELECTIVE, level: isSenior ? 2 : 1, seniorCmpt: false, free: true })
      }
      return slots
    },
  }
}
