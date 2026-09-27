import { courseInfo } from '../data/prereqs.js'
import { breadth } from '../data/breadth.js'
import type { Degree, DegreeGroup } from '../data/degrees/types.js'

// The degree audit in credit units: which requirement group each course counts toward, how much of
// each group is met, and the degree-level totals (120 cu, 66 at the 200 level or higher). Pure and
// deterministic; it runs inside renders and the planner loop, so no search beyond one-step swaps.
//
// Rules applied, from the Arts & Science policies (programs.usask.ca/arts-and-science/policies.php)
// and the program page: a course counts toward one group only; "A or B" items count once per group
// (oneOf); "A and B" items count only together (allOf); a per-area ceiling inside a group (C3 junior
// science, 6 cu per area); "no more than 6 credit units from one subject" across the capped groups,
// with 9 allowed in one subject across English writing and Indigenous learning; and junior (100-level)
// credit counting toward the total only up to totalCu - minSeniorCu. A course that no group takes
// counts as a C5 elective (assignment null).

/** Credit values the 2026-27 program pages print (ENG 110.6, MATH 133.4) for courses courseInfo may lack. */
const LISTED_CU: Record<string, number> = { ENG110: 6, CREE101: 6, PHIL110: 6, MATH133: 4, MUS120: 2, MUS121: 2, MUS125: 1 }

/**
 * A planned unnamed slot ('elective:<n>:<label>', isElective in plan.ts) counts 3 cu toward the group
 * with that label; TYPED_BREADTH_LABEL is a C2 slot that must be Humanities or Social Science. A slot
 * counts as senior credit only when its label says so ("Senior elective (200-level or higher)",
 * "CMPT elective (410 or higher)"); any other slot counts as junior, the safe side of the 66.
 */
const SLOT = /^elective:\d+:(.*)$/
export const TYPED_BREADTH_LABEL = 'Breadth: Humanities or Social Science'
const slotLabel = (code: string) => code.match(SLOT)?.[1]

const baseCode = (code: string) => (SLOT.test(code) ? code : code.replace(/\s+/g, '').toUpperCase().replace(/\.\d+$/, ''))
const levelOf = (code: string) => {
  const label = slotLabel(code)
  if (label !== undefined) return /senior|410 or higher|200-level or higher/i.test(label) ? 200 : 100
  return Number(code.match(/(\d)\d\d$/)?.[1] ?? 0) * 100
}
/** A slot is its own subject: it never counts against a subject cap. */
const subjectOf = (code: string) => (SLOT.test(code) ? code : (code.match(/^[A-Z]+/)?.[0] ?? code))
/** "PHYS117" → "PHYS 117", for sentences. */
const spaced = (code: string) => slotLabel(code) ?? code.replace(/^([A-Z]+)(\d)/, '$1 $2')

/** A course's credit units: the catalogue's, else the digit after the dot ("ENG 110.6"), else 3. */
export function courseCu(code: string): number {
  if (SLOT.test(code)) return 3
  const base = baseCode(code)
  const info = courseInfo[base]
  if (info && Number.isFinite(info.creditUnits)) return info.creditUnits
  const dot = code.trim().match(/\.(\d+)$/)
  if (dot) return Number(dot[1])
  return LISTED_CU[base] ?? 3
}

const listSets = new WeakMap<DegreeGroup, Set<string>>()
/** Whether `group` takes `code` at all: listed, or matched by the group's rule (or a slot with its label). */
export function groupAccepts(group: DegreeGroup, code: string): boolean {
  const label = slotLabel(code)
  // "Junior science: Biology, Chemistry or Earth Science" is still a Junior science slot, narrowed.
  if (label !== undefined) return label === group.label || label.startsWith(`${group.label}: `) || (label === TYPED_BREADTH_LABEL && !!group.typeMin)
  let set = listSets.get(group)
  if (!set) listSets.set(group, (set = new Set(group.courses)))
  const base = baseCode(code)
  return set.has(base) || !!group.matches?.(base)
}

export interface DegreeGroupProgress {
  group: DegreeGroup
  /** Courses counted here, in the order they were placed. */
  courses: string[]
  /** Credit units met, at most needCu. */
  cu: number
  remainingCu: number
  /** For a group with typeMin: credit units of those program types still needed. */
  typeRemainingCu?: number
}

export interface DegreeAudit {
  degree: Degree
  groups: DegreeGroupProgress[]
  /** The group each course counts toward; null counts only as a C5 elective. */
  assignment: Record<string, string | null>
  /** Every distinct course's credit units, with junior credit only up to totalCu - minSeniorCu. */
  countedCu: number
  /** Credit units at the 200 level or higher. */
  seniorCu: number
  remainingCu: number
  remainingSeniorCu: number
  /** Caps and minimums the courses break, as sentences a student can read. */
  violations: string[]
}

interface Unit {
  codes: string[]
  cu: number
  /** Credit units per subject. */
  subjects: Map<string, number>
  /** Indexes of the groups that could take it. */
  candidates: number[]
  at: number | null
}

interface Prepared {
  capped: boolean[]
  exception: boolean[]
  /** Per group: code → index of its oneOf set. */
  oneOf: Map<string, number>[]
  /** Per group: code → area name. */
  area: Map<string, string>[]
  /** Per group: code → index of its allOf set. */
  allOf: Map<string, number>[]
  /** Code → the groups that take it on its own (static per degree, so cached). */
  candidates: Map<string, number[]>
}

const prepared = new WeakMap<Degree, Prepared>()
function prepare(degree: Degree): Prepared {
  const cached = prepared.get(degree)
  if (cached) return cached
  const capped = new Set(degree.subjectCap?.groups ?? [])
  const exception = new Set(degree.subjectCap?.exception?.groups ?? [])
  const indexed = (sets: string[][] | undefined) => {
    const map = new Map<string, number>()
    sets?.forEach((set, i) => set.forEach((code) => map.set(code, i)))
    return map
  }
  const result: Prepared = {
    capped: degree.groups.map((g) => capped.has(g.id)),
    exception: degree.groups.map((g) => exception.has(g.id)),
    oneOf: degree.groups.map((g) => indexed(g.oneOf)),
    allOf: degree.groups.map((g) => indexed(g.allOf)),
    area: degree.groups.map((g) => {
      const map = new Map<string, string>()
      for (const [name, codes] of Object.entries(g.areas?.byArea ?? {})) codes.forEach((code) => map.set(code, name))
      return map
    }),
    candidates: new Map(),
  }
  prepared.set(degree, result)
  return result
}

const isTyped = (group: DegreeGroup, code: string) =>
  !!group.typeMin &&
  (slotLabel(code) === TYPED_BREADTH_LABEL || (breadth[code] ?? []).some((type) => group.typeMin!.types.includes(type)))

/** Audits `courses` (completed, in progress and planned alike) against `degree`, in credit units. */
export function auditDegree(degree: Degree, courses: Iterable<string>): DegreeAudit {
  const prep = prepare(degree)
  const groups = degree.groups
  const cap = degree.subjectCap

  const codes = [...new Set([...courses].map(baseCode))].filter(Boolean)
  const present = new Set(codes)

  // Units: one per course, plus one per complete "A and B" set, which only its group takes whole.
  const units: Unit[] = []
  const makeUnit = (members: string[], candidates: number[]): Unit => {
    const subjects = new Map<string, number>()
    let cu = 0
    for (const code of members) {
      const c = courseCu(code)
      cu += c
      subjects.set(subjectOf(code), (subjects.get(subjectOf(code)) ?? 0) + c)
    }
    return { codes: members, cu, subjects, candidates, at: null }
  }
  for (const code of codes) {
    let candidates = prep.candidates.get(code)
    if (!candidates) {
      candidates = []
      for (let gi = 0; gi < groups.length; gi++) {
        if (!prep.allOf[gi].has(code) && groupAccepts(groups[gi], code)) candidates.push(gi)
      }
      // A named requirement before an open choice, a group that lists the course before one whose
      // rule matches it, then page order: PHIL 232 fills the ethics slot, not breadth.
      const rank = (gi: number) => (groups[gi].open ? 2 : 0) + (groups[gi].courses.includes(code) ? 0 : 1)
      candidates.sort((a, b) => rank(a) - rank(b) || a - b)
      prep.candidates.set(code, candidates)
    }
    units.push(makeUnit([code], candidates))
  }
  groups.forEach((g, gi) => {
    for (const set of g.allOf ?? []) if (set.every((code) => present.has(code))) units.push(makeUnit([...set], [gi]))
  })

  // State.
  const sum = groups.map(() => 0)
  const members: Unit[][] = groups.map(() => [])
  const oneOfUsed = groups.map(() => new Map<number, number>())
  const areaCu = groups.map(() => new Map<string, number>())
  const subjectTotal = new Map<string, number>()
  const subjectOutside = new Map<string, number>()
  const placedCodes = new Set<string>()

  const subjectOk = (unit: Unit, gi: number) => {
    if (!cap || !prep.capped[gi]) return true
    for (const [subject, cu] of unit.subjects) {
      const total = (subjectTotal.get(subject) ?? 0) + cu
      if (total <= cap.cu) continue
      const outside = (subjectOutside.get(subject) ?? 0) + (prep.exception[gi] ? 0 : cu)
      const exceptionFree = [...subjectTotal].every(([s, t]) => s === subject || t <= cap.cu)
      if (cap.exception && total <= cap.exception.cu && outside === 0 && exceptionFree) continue
      return false
    }
    return true
  }
  const areaOk = (unit: Unit, gi: number) => {
    const capCu = groups[gi].areas?.capCu
    if (capCu === undefined) return true
    for (const code of unit.codes) {
      const area = prep.area[gi].get(code)
      if (area !== undefined && (areaCu[gi].get(area) ?? 0) + courseCu(code) > capCu) return false
    }
    return true
  }
  const oneOfOk = (unit: Unit, gi: number) =>
    unit.codes.every((code) => {
      const set = prep.oneOf[gi].get(code)
      return set === undefined || !oneOfUsed[gi].get(set)
    })
  const canPlace = (unit: Unit, gi: number) =>
    sum[gi] < groups[gi].needCu &&
    unit.codes.every((code) => !placedCodes.has(code)) &&
    oneOfOk(unit, gi) &&
    areaOk(unit, gi) &&
    subjectOk(unit, gi)

  const move = (unit: Unit, gi: number, sign: 1 | -1) => {
    sum[gi] += sign * unit.cu
    for (const code of unit.codes) {
      const set = prep.oneOf[gi].get(code)
      if (set !== undefined) oneOfUsed[gi].set(set, (oneOfUsed[gi].get(set) ?? 0) + sign)
      const area = prep.area[gi].get(code)
      if (area !== undefined) areaCu[gi].set(area, (areaCu[gi].get(area) ?? 0) + sign * courseCu(code))
      if (sign > 0) placedCodes.add(code)
      else placedCodes.delete(code)
    }
    if (cap && prep.capped[gi]) {
      for (const [subject, cu] of unit.subjects) {
        subjectTotal.set(subject, (subjectTotal.get(subject) ?? 0) + sign * cu)
        if (!prep.exception[gi]) subjectOutside.set(subject, (subjectOutside.get(subject) ?? 0) + sign * cu)
      }
    }
  }
  const place = (unit: Unit, gi: number) => {
    move(unit, gi, 1)
    members[gi].push(unit)
    unit.at = gi
  }
  const unplace = (unit: Unit) => {
    const gi = unit.at!
    move(unit, gi, -1)
    members[gi].splice(members[gi].indexOf(unit), 1)
    unit.at = null
  }

  /** Makes room for `unit` in one of its groups by moving one course already there to another group. */
  const augment = (unit: Unit) => {
    for (const gi of unit.candidates) {
      for (const other of [...members[gi]]) {
        for (const hi of other.candidates) {
          if (hi === gi) continue
          unplace(other)
          if (canPlace(other, hi)) {
            place(other, hi)
            if (canPlace(unit, gi)) {
              place(unit, gi)
              return true
            }
            unplace(other)
          }
          place(other, gi)
        }
      }
    }
    return false
  }

  // Real courses before planned slots, then most constrained first (fewest groups can take it),
  // bundles before single courses, then by code.
  const order = units
    .filter((u) => u.candidates.length > 0)
    .sort(
      (a, b) =>
        Number(SLOT.test(a.codes[0])) - Number(SLOT.test(b.codes[0])) ||
        a.candidates.length - b.candidates.length ||
        b.codes.length - a.codes.length ||
        a.codes[0].localeCompare(b.codes[0]),
    )
  for (const unit of order) {
    const gi = unit.candidates.find((g) => canPlace(unit, g))
    if (gi !== undefined) place(unit, gi)
    else augment(unit)
  }

  // A type minimum (C2: 3 cu of Humanities or Social Science): swap an untyped course out for a typed
  // one that counts nowhere, and give the untyped one another group if it has one.
  groups.forEach((g, gi) => {
    if (!g.typeMin) return
    const typedCu = () =>
      members[gi].reduce((n, u) => n + u.codes.filter((c) => isTyped(g, c)).reduce((m, c) => m + courseCu(c), 0), 0)
    for (const typed of order) {
      if (typedCu() >= g.typeMin.cu) break
      if (typed.at !== null || !typed.candidates.includes(gi) || !typed.codes.some((c) => isTyped(g, c))) continue
      const untyped = members[gi].find((u) => !u.codes.some((c) => isTyped(g, c)))
      if (!untyped) break
      unplace(untyped)
      if (canPlace(typed, gi)) {
        place(typed, gi)
        const hi = untyped.candidates.find((h) => h !== gi && canPlace(untyped, h))
        if (hi !== undefined) place(untyped, hi)
      } else place(untyped, gi)
    }
  })

  // Why a course that a group takes still counts nowhere.
  const violations: string[] = []
  for (const unit of order) {
    if (unit.at !== null || unit.codes.some((c) => placedCodes.has(c))) continue
    const code = unit.codes.map(spaced).join(' and ')
    for (const gi of unit.candidates) {
      if (sum[gi] >= groups[gi].needCu) continue
      const label = groups[gi].label
      if (!oneOfOk(unit, gi)) {
        const set = groups[gi].oneOf![prep.oneOf[gi].get(unit.codes[0])!]
        violations.push(`Only one of ${set.map(spaced).join(', ')} counts toward ${label}; ${code} counts as an elective.`)
      } else if (!areaOk(unit, gi)) {
        const area = prep.area[gi].get(unit.codes[0])
        violations.push(
          `${code} doesn't count toward ${label}: at most ${groups[gi].areas!.capCu} credit units may come from ${area}.`,
        )
      } else if (!subjectOk(unit, gi)) {
        violations.push(
          `${code} doesn't count toward ${label}: at most ${cap!.cu} credit units from one subject may be used in ` +
            `the college, breadth and junior cognate requirements.`,
        )
      } else continue
      break
    }
  }

  const assignment: Record<string, string | null> = {}
  for (const code of codes) assignment[code] = null
  for (const unit of units) if (unit.at !== null) for (const code of unit.codes) assignment[code] = groups[unit.at].id

  const progress: DegreeGroupProgress[] = groups.map((g, gi) => {
    const cu = Math.min(sum[gi], g.needCu)
    const entry: DegreeGroupProgress = {
      group: g,
      courses: members[gi].flatMap((u) => u.codes),
      cu,
      remainingCu: g.needCu - cu,
    }
    if (g.typeMin) {
      const typed = entry.courses.filter((c) => isTyped(g, c)).reduce((n, c) => n + courseCu(c), 0)
      entry.typeRemainingCu = Math.max(0, g.typeMin.cu - typed)
      if (entry.typeRemainingCu > 0 && entry.remainingCu === 0) {
        violations.push(
          `${g.label} needs at least ${g.typeMin.cu} credit units of ${g.typeMin.types.join(' or ')}; ` +
            `${entry.typeRemainingCu} are still missing.`,
        )
      }
    }
    return entry
  })

  let juniorCu = 0
  let seniorCu = 0
  for (const code of codes) {
    if (levelOf(code) >= 200) seniorCu += courseCu(code)
    else juniorCu += courseCu(code)
  }
  const juniorLimit = degree.totalCu - degree.minSeniorCu
  if (juniorCu > juniorLimit) {
    violations.push(
      `${juniorCu - juniorLimit} credit units of 100-level courses don't count: at most ${juniorLimit} may be junior.`,
    )
  }
  const countedCu = Math.min(juniorCu, juniorLimit) + seniorCu
  if (countedCu >= degree.totalCu && seniorCu < degree.minSeniorCu) {
    violations.push(`Only ${seniorCu} credit units are at the 200 level or higher; the degree needs ${degree.minSeniorCu}.`)
  }

  return {
    degree,
    groups: progress,
    assignment,
    countedCu,
    seniorCu,
    remainingCu: Math.max(0, degree.totalCu - countedCu),
    remainingSeniorCu: Math.max(0, degree.minSeniorCu - seniorCu),
    violations,
  }
}
