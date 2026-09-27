import { courseInfo } from '../data/prereqs.ts'
import type { RequirementGroup } from '../data/specializations.ts'
import type { SpecializationMatch } from './match.ts'
import { courseLevel, currentTermOf, DEFAULT_SUMMER_COURSES, isElective, type PlannedTerm, type Season, type TermStart } from './plan.ts'

// The Academic Skill Tree: the student's degree drawn as a tree that grows UP. Roots at the bottom,
// Year 1 above them, the years rising to a canopy of the credentials they're working toward. Fall
// courses sit left of the trunk and Winter courses right of it, each on a short twig; a Spring/Summer
// term gets its own rows at the top of its year, on the Winter side (it comes after Winter).
//
// Every card sits in its own term: a registered course in the term it's registered for, a planned
// one in the plan's term, a completed one in the term the transcript dated it (or, with no date, by
// its course level, and it says so). No Fall or Winter lane holds more than the student's load, no
// Spring/Summer lane more than its own cap.
//
// Pure and React-free, like roadmapLayout.ts: it consumes buildStudentPlan's output and the match
// engine's targets as they are, and only decides where things go and the shape of the wood (a
// tapered trunk, twigs, the crown's branches, a few roots). Prerequisite links are computed as
// smooth curves, and the UI draws them only for the course you select. It never schedules anything
// itself and never invents a course.

export type TreeStatus = 'completed' | 'inProgress' | 'next' | 'planned' | 'locked'
export type TreeLane = 'fall' | 'winter' | 'summer'
export type TreeTargetKind = 'specialization' | 'certificate' | 'minor'

export interface SkillTreeTarget {
  id: string
  name: string
  kind: TreeTargetKind
  done: number
  total: number
  groups: RequirementGroup[]
  /** Planned (the hero or one planned alongside it), rather than only detected partway done. */
  planned: boolean
}

/** The degree in credit units (from the degree audit), for the readout in the canopy and the trunk's milestones. */
export interface TreeDegreeProgress {
  name: string
  doneCu: number
  inProgressCu: number
  plannedCu: number
  totalCu: number
  /** C1-C5, each with what it needs and what's done and planned toward it. */
  blocks: { id: string; label: string; needCu: number; doneCu: number; plannedCu: number }[]
  /** Drawn on the trunk where the tree's credit units first reach `afterCu`. */
  milestones: { id: string; label: string; afterCu: number; detail: string }[]
  /** The degree requirement each course counts toward: "C4 Major: Senior core". */
  countsToward: Record<string, string>
}

export interface SkillTreeInput {
  completed: Iterable<string>
  /** Registered or in progress, not finished. A course that's also completed counts as completed. */
  inProgress: Iterable<string>
  plan: PlannedTerm[]
  /** The term being sat right now. */
  currentTerm: TermStart
  /** Each in-progress or registered course's own term, 'Winter 2027'. Missing: the current term. */
  inProgressTerms?: Record<string, string>
  /** When the transcript dated a completed course, 'Fall 2024'. Missing: placed by course level, approximately. */
  completedTerms?: Record<string, string>
  /** The Fall/Winter cap: the student's courses per term (default 5). */
  termLoad?: number
  /** The Spring/Summer cap (default 2). */
  summerLoad?: number
  degree?: TreeDegreeProgress
  /** Leaves, in order: the hero first. Only the first MAX_LEAVES are drawn. */
  targets: SkillTreeTarget[]
  /** The best next course (the app's top-overlap course), when it's in the plan and unlocked. */
  bestNext?: string | null
  /** The board's width in px; everything else follows from it. */
  width: number
}

export interface TreeBand {
  key: string
  kind: 'canopy' | 'year' | 'roots'
  /** 1-based academic year, 0 for the roots and the canopy. */
  year: number
  label: string
  y: number
  h: number
  current: boolean
  /** Each lane's head ("Fall", "Winter 2027", "Spring/Summer 2027"), `y` from the band's top. */
  heads: { lane: TreeLane; label: string; y: number }[]
}

export interface TreeNode {
  code: string
  status: TreeStatus
  year: number
  lane: TreeLane
  row: number
  col: number
  x: number
  y: number
  w: number
  h: number
  /** "Winter 2027", "Fall 2026" (now), or "Year 2" for a completed course with no date (see termKnown). */
  term: string
  /** False for a completed course the transcript didn't date: its place is approximate, by course level. */
  termKnown: boolean
  /** In progress in the term being sat now ("Now"); a registered course in a later term is false. */
  current: boolean
  /** Credit units. */
  cu: number
  /** The degree requirement it counts toward, when the degree is mapped: "C4 Major: Senior core". */
  degreeGroup: string | null
  /** Leaf indexes this course counts toward. */
  creds: number[]
  /** A requirement slot where any `need` of `of` courses count: drawn as a dashed elective. */
  elective: { need: number; of: number; options: string[] } | null
  /** Codes on the tree this course needs first, and the ones it unlocks. */
  prereqs: string[]
  unlocks: string[]
}

export interface TreeLeaf {
  index: number
  id: string
  name: string
  kind: TreeTargetKind
  done: number
  total: number
  planned: boolean
  x: number
  y: number
  w: number
  h: number
  /** Every course on the tree that counts toward it. */
  codes: string[]
  /** The first course still to take on its branch, in plan order. */
  next: string | null
}

/** A prerequisite link, prerequisite → the course it unlocks, as a smooth curve up the tree. */
export interface TreeLink {
  from: string
  to: string
  /** Ends just under the unlocked course, where the arrowhead takes over. */
  d: string
  /** The arrowhead: its tip touches the unlocked course's bottom edge, pointing up. */
  arrow: string
  /** Roughly how long `d` is, in pixels, so a signal can run along it at a steady size. */
  length: number
  /** One of several options ("CMPT 260 or CMPT 263"). */
  conditional: boolean
}

/** A point on the way through the degree (admission to the major, the Honours application), on the trunk. */
export interface TreeMilestone {
  id: string
  label: string
  detail: string
  afterCu: number
  /** On the boundary above the year in which the tree's credit units first reach afterCu. */
  y: number
  /** Already passed on completed courses alone. */
  reached: boolean
}

export interface SkillTreeLayout {
  width: number
  height: number
  compact: boolean
  bands: TreeBand[]
  /** The degree readout at the top of the canopy, when the degree is mapped. */
  degree: { progress: TreeDegreeProgress; x: number; y: number; w: number; h: number } | null
  milestones: TreeMilestone[]
  termLoad: number
  summerLoad: number
  nodes: TreeNode[]
  leaves: TreeLeaf[]
  links: TreeLink[]
  /** The wood: the trunk's filled outline and its centre line, a twig per course, a branch per leaf, the roots. */
  trunk: string
  trunkLine: string
  twigs: { code: string; d: string }[]
  branches: { leaf: number; d: string }[]
  roots: { d: string; w: number }[]
  trunkX: number
  trunkWidth: number
  /** Where the trunk meets the roots, and where it opens into the crown. */
  trunkBase: number
  trunkTop: number
  currentYear: number
}

/** The hero plus three restrained tints (see skilltree.css); more than that and the canopy stops reading at a glance. */
export const MAX_LEAVES = 4

const STATUS_RANK: Record<TreeStatus, number> = { completed: 0, inProgress: 1, next: 2, planned: 2, locked: 3 }

/** The academic year a term belongs to: Fall Y, Winter Y+1 and Spring/Summer Y+1 are one year. */
function academicYear(term: TermStart) {
  return term.season === 'Fall' ? term.year : term.year - 1
}

const SEASON_RANK: Record<Season, number> = { Winter: 0, 'Spring/Summer': 1, Fall: 2 }
const termRank = (t: TermStart) => t.year * 10 + SEASON_RANK[t.season]
const laneOf = (season: Season): TreeLane => (season === 'Fall' ? 'fall' : season === 'Winter' ? 'winter' : 'summer')
/** Fall, then Winter, then Spring/Summer: the order of the terms within a year. */
const LANE_ORDER: Record<TreeLane, number> = { fall: 0, winter: 1, summer: 2 }

/** Credit units: the catalogue's, else the digit after a dot ("CMPT 400.6"), else 3. */
function cuOf(code: string): number {
  const units = courseInfo[code]?.creditUnits
  if (units && units > 0) return units
  const dot = code.match(/\.(\d)/)
  return dot ? Number(dot[1]) : 3
}

function parseTerm(label: string): TermStart | null {
  const [season, year] = label.split(' ')
  return (season === 'Fall' || season === 'Winter' || season === 'Spring/Summer') && Number(year) > 0
    ? { season, year: Number(year) }
    : null
}

/** A prerequisite the catalogue lets you take alongside ("can be taken concurrently") doesn't sequence. */
function isConcurrent(code: string) {
  return /concurrently/i.test(courseInfo[code]?.prerequisiteText ?? '')
}

interface Geometry {
  compact: boolean
  gutter: number
  pad: number
  nodeMinW: number
  nodeMaxW: number
  nodeH: number
  colGap: number
  rowGap: number
  innerGap: number
  bandTop: number
  bandBottom: number
  emptyBand: number
  /** Room between a year's Fall/Winter rows and its Spring/Summer rows, for the Spring/Summer head. */
  summerGap: number
  /** The degree readout's height at the top of the canopy. */
  degreeH: number
  maxCols: number
  leafH: number
  leafGap: number
  canopyTop: number
  rootsH: number
  /** The trunk's width at the roots and at the crown, and how far it sways. */
  trunkW: number
  trunkTopW: number
  sway: number
}

function geometry(width: number): Geometry {
  const compact = width < 560
  // A phone gets one card per side, wide enough for the course title; a desktop gets two.
  return compact
    ? { compact, gutter: 24, pad: 10, nodeMinW: 112, nodeMaxW: 172, nodeH: 58, colGap: 10, rowGap: 12, innerGap: 20, bandTop: 38, bandBottom: 14, emptyBand: 64, summerGap: 30, degreeH: 104, maxCols: 1, leafH: 64, leafGap: 26, canopyTop: 12, rootsH: 170, trunkW: 18, trunkTopW: 3, sway: 2 }
    : { compact, gutter: 36, pad: 16, nodeMinW: 150, nodeMaxW: 188, nodeH: 62, colGap: 14, rowGap: 16, innerGap: 28, bandTop: 44, bandBottom: 18, emptyBand: 80, summerGap: 32, degreeH: 100, maxCols: 2, leafH: 72, leafGap: 30, canopyTop: 16, rootsH: 190, trunkW: 26, trunkTopW: 4, sway: 3 }
}

interface Draft {
  code: string
  status: TreeStatus
  year: number
  lane: TreeLane | null
  term: string
  termKnown: boolean
  current: boolean
  creds: number[]
  elective: TreeNode['elective']
  order: number
  tier: number
  row: number
  col: number
}

/** A full-time term's load: the default cap, and the most an undated finished term is given. */
const TERM_LOAD = 5

export function layoutSkillTree(input: SkillTreeInput): SkillTreeLayout {
  const g = geometry(Math.max(300, input.width))
  const width = Math.max(300, Math.round(input.width))
  const completed = new Set(input.completed)
  const inProgress = [...new Set(input.inProgress)].filter((c) => !completed.has(c)).sort()
  const doneOrNow = new Set([...completed, ...inProgress])
  const current = input.currentTerm
  const targets = input.targets.slice(0, MAX_LEAVES)
  const termLoad = Math.max(1, Math.floor(input.termLoad ?? TERM_LOAD))
  const summerLoad = Math.max(1, Math.floor(input.summerLoad ?? DEFAULT_SUMMER_COURSES))
  // A finished term the transcript didn't date held at most a full-time load, whatever the student
  // plans to take now: a part-time plan doesn't make their first years part-time.
  const pastLoad = Math.max(termLoad, TERM_LOAD)
  const currentAY = academicYear(current)

  // Completed courses the transcript dated go in that term; the rest are placed by level.
  const knownDone = new Map<string, TermStart>()
  for (const code of [...completed].sort()) {
    const t = parseTerm(input.completedTerms?.[code] ?? '')
    if (t) knownDone.set(code, t)
  }
  const undated = [...completed].filter((c) => !knownDone.has(c))

  // ── which year is "now" ──
  // From what's real: credit units done (a full-time year is 30), the highest completed level, the
  // earliest dated term, and room: every undated course needs a finished Fall or Winter lane with
  // space (a full-time load each). Never a year more than those need.
  const elapsed = current.season === 'Fall' ? 0 : current.season === 'Winter' ? 0.5 : 1
  const doneCu = [...completed].reduce((sum, c) => sum + cuOf(c), 0)
  const cuYear = Math.floor(doneCu / 30 - elapsed + 0.25) + 1
  const topLevel = Math.max(0, ...[...completed].map((c) => Math.min(4, courseLevel(c))))
  const knownYear = Math.max(1, ...[...knownDone.values()].map((t) => currentAY - academicYear(t) + 1))
  /** The Fall/Winter lanes of `year` that are already over when the student is in Year `now`. */
  const finishedLanes = (year: number, now: number): ('fall' | 'winter')[] =>
    year < now ? ['fall', 'winter'] : year > now || current.season === 'Fall' ? [] : current.season === 'Winter' ? ['fall'] : ['fall', 'winter']
  const knownIn = (ay: number, lane: TreeLane) =>
    [...knownDone.values()].filter((t) => academicYear(t) === ay && laneOf(t.season) === lane).length
  const room = (now: number) => {
    let free = 0
    for (let year = 1; year <= now; year++) {
      for (const lane of finishedLanes(year, now)) free += Math.max(0, pastLoad - knownIn(currentAY - (now - year), lane))
    }
    return free
  }
  let currentYear = Math.max(1, cuYear, topLevel, knownYear)
  while (room(currentYear) < undated.length) currentYear++
  // A student who hasn't started (nothing done, nothing registered) starts Year 1 with their plan's
  // first term, not with the calendar: a plan from Fall 2027 is Year 1 from Fall 2027.
  const started = completed.size > 0 || inProgress.length > 0
  const firstTerm = input.plan.map((t) => parseTerm(t.label)).find((t) => t !== null)
  const baseAY = !started && firstTerm ? Math.max(currentAY, academicYear(firstTerm)) : currentAY
  const yearOf = (t: TermStart) => Math.max(1, currentYear + academicYear(t) - baseAY)
  // Completed courses with no date sit in a year that's already over (or in this year's Fall, when it's Winter).
  const lastDoneYear = current.season === 'Fall' ? currentYear - 1 : currentYear

  // ── the courses ──
  const drafts = new Map<string, Draft>()
  const credsOf = (code: string) =>
    targets.flatMap((t, i) => (t.groups.some((grp) => grp.courses.includes(code)) ? [i] : []))
  let order = 0
  const add = (code: string, d: Omit<Draft, 'code' | 'creds' | 'order' | 'tier' | 'row' | 'col' | 'elective'>) => {
    if (drafts.has(code)) return
    drafts.set(code, { code, ...d, creds: credsOf(code), elective: null, order: order++, tier: 0, row: 0, col: 0 })
  }
  const placed = (t: TermStart) => ({ year: yearOf(t), lane: laneOf(t.season), term: `${t.season} ${t.year}`, termKnown: true })

  for (const [code, t] of [...knownDone].sort((a, b) => termRank(a[1]) - termRank(b[1]) || a[0].localeCompare(b[0]))) {
    add(code, { status: 'completed', ...placed(t), current: false })
  }
  // By course level, into a finished year with room; a year that's full passes the course to the
  // nearest one that isn't (later first: a student who took many 100-level courses took some later).
  const heldIn = (year: number) =>
    [...drafts.values()].filter((d) => d.year === year && (d.lane === null || finishedLanes(year, currentYear).includes(d.lane as 'fall' | 'winter'))).length
  const capacity = (year: number) => finishedLanes(year, currentYear).length * pastLoad
  for (const code of undated.sort((a, b) => courseLevel(a) - courseLevel(b) || a.localeCompare(b))) {
    const want = Math.min(lastDoneYear, Math.max(1, Math.min(4, courseLevel(code))))
    let year = want
    for (let k = 0; k <= 2 * lastDoneYear; k++) {
      const y = want + (k % 2 === 1 ? (k + 1) / 2 : -k / 2)
      if (y >= 1 && y <= lastDoneYear && heldIn(y) < capacity(y)) {
        year = y
        break
      }
    }
    add(code, { status: 'completed', year, lane: null, term: '', termKnown: false, current: false })
  }
  // Registered and in-progress courses in their own term. One whose term is already over (a stale
  // label) is still under way, so it's now.
  for (const code of inProgress) {
    const own = parseTerm(input.inProgressTerms?.[code] ?? '')
    const t = own && termRank(own) > termRank(current) ? own : current
    add(code, { status: 'inProgress', ...placed(t), current: t === current })
  }
  for (const term of input.plan) {
    const t = parseTerm(term.label) ?? current
    for (const course of term.courses) {
      if (drafts.has(course.code)) continue
      add(course.code, { status: 'planned', ...placed(t), current: false })
    }
  }
  for (const d of drafts.values()) {
    if (d.status === 'completed' && !d.termKnown) d.term = `Year ${d.year}`
  }

  // ── prerequisite links: one per AND-group, the option actually on the tree ──
  // Prefer the option already done, then the earliest; a group with nothing on the tree draws no link.
  const rank = (code: string) => {
    const d = drafts.get(code)!
    return STATUS_RANK[d.status] * 100 + d.year * 10 + d.order / 1000
  }
  const links: { from: string; to: string; conditional: boolean; sequencing: boolean }[] = []
  for (const d of drafts.values()) {
    const concurrent = isConcurrent(d.code)
    for (const options of courseInfo[d.code]?.requires ?? []) {
      const onTree = options.filter((o) => o !== d.code && drafts.has(o)).sort((a, b) => rank(a) - rank(b))
      if (onTree.length === 0) continue
      links.push({ from: onTree[0], to: d.code, conditional: options.length > 1, sequencing: !concurrent })
    }
  }

  // ── status: planned, locked, the one beacon ──
  for (const d of drafts.values()) {
    if (d.status !== 'planned') continue
    const unmet = (courseInfo[d.code]?.requires ?? []).some(
      (options) => options.length > 0 && !options.some((o) => doneOrNow.has(o)),
    )
    if (unmet) d.status = 'locked'
  }
  // An unnamed elective is never the one course to take next: there's nothing specific to take. A
  // first term of only electives passes the beacon to the first named course after it.
  const firstPlanned = input.plan
    .flatMap((t) => t.courses.map((c) => c.code))
    .find((c) => !isElective(c) && drafts.get(c)?.status === 'planned')
  const beacon =
    input.bestNext && drafts.get(input.bestNext)?.status === 'planned' ? input.bestNext : (firstPlanned ?? null)
  if (beacon) drafts.get(beacon)!.status = 'next'

  // ── electives: a planned pick for a slot where any one of several courses would do ──
  const plannedTargets = targets.filter((t) => t.planned)
  for (const d of drafts.values()) {
    if (d.status === 'completed' || d.status === 'inProgress') continue
    const groups = plannedTargets.flatMap((t) => t.groups.filter((grp) => grp.courses.includes(d.code)))
    if (groups.length === 0 || groups.some((grp) => grp.courses.length <= grp.need)) continue
    const grp = groups[0]
    const open = grp.courses.filter((c) => !doneOrNow.has(c))
    const need = Math.max(1, grp.need - grp.courses.filter((c) => doneOrNow.has(c)).length)
    if (open.length > need) d.elective = { need, of: open.length, options: open }
  }
  // An unnamed slot ("Breadth elective") is an elective too, with no list to choose from here.
  for (const d of drafts.values()) if (isElective(d.code)) d.elective = { need: 1, of: 0, options: [] }

  // ── lanes for completed courses the transcript didn't date ──
  // A course whose prerequisite sits in the same year went in Winter; one that unlocks a course in
  // the same year went in Fall; the rest alternate to balance the two sides, in code order. Only a
  // lane that's already over, with room: when it's Winter now, this year's can only be the Fall.
  const sameYear = (a: string, b: string) => drafts.get(a)!.year === drafts.get(b)!.year
  const maxYear = Math.max(4, currentYear, ...[...drafts.values()].map((d) => d.year))
  const seq = links.filter((l) => l.sequencing && drafts.get(l.from)!.status === 'completed' && drafts.get(l.to)!.status === 'completed')
  for (let year = 1; year <= maxYear; year++) {
    const inYear = [...drafts.values()].filter((d) => d.year === year)
    const lanes = finishedLanes(year, currentYear)
    const count = { fall: inYear.filter((d) => d.lane === 'fall').length, winter: inYear.filter((d) => d.lane === 'winter').length }
    const hasRoom = (lane: 'fall' | 'winter') => lanes.includes(lane) && count[lane] < pastLoad
    const free: Draft[] = []
    for (const d of inYear) {
      if (d.lane) continue
      const hasPrereq = seq.some((l) => l.to === d.code && sameYear(l.from, d.code))
      const unlocks = seq.some((l) => l.from === d.code && sameYear(l.to, d.code))
      if (hasPrereq && hasRoom('winter')) d.lane = 'winter'
      else if (unlocks && hasRoom('fall')) d.lane = 'fall'
      if (d.lane) count[d.lane as 'fall' | 'winter']++
      else free.push(d)
    }
    for (const d of free.sort((a, b) => a.code.localeCompare(b.code))) {
      const open = lanes.filter((lane) => count[lane] < pastLoad)
      const pick: ('fall' | 'winter')[] = open.length > 0 ? open : lanes.length > 0 ? lanes : ['fall']
      const lane = pick.reduce((a, b) => (count[b] < count[a] ? b : a))
      d.lane = lane
      count[lane]++
    }
  }

  // ── rows within each year: prerequisites below what they unlock ──
  // Only on the same side of the trunk. Across it, Fall already comes before Winter (and Spring/Summer
  // sits above Winter), so a Fall prerequisite doesn't lift its Winter course a row: that lift is what
  // stacked a year's chains into a staircase. Its link runs across the trunk instead.
  const sameSide = (a: string, b: string) => sameYear(a, b) && drafts.get(a)!.lane === drafts.get(b)!.lane
  const tierOf = (d: Draft, seen = new Set<string>()): number => {
    if (seen.has(d.code)) return 0
    seen.add(d.code)
    const below = links.filter((l) => l.sequencing && l.to === d.code && sameSide(l.from, d.code))
    return below.length === 0 ? 0 : 1 + Math.max(...below.map((l) => tierOf(drafts.get(l.from)!, seen)))
  }
  for (const d of drafts.values()) d.tier = tierOf(d)
  const unlockCount = (code: string) => links.filter((l) => l.from === code).length

  // Lanes and columns. Column 0 hugs the trunk; busy years spill outward, quiet ones stay close.
  const trunkWidth = g.trunkW
  const trunkX = Math.round(g.gutter + (width - g.gutter - g.pad) / 2)
  const laneW = trunkX - trunkWidth / 2 - g.innerGap - g.gutter
  let cols = g.maxCols
  while (cols > 1 && (laneW - (cols - 1) * g.colGap) / cols < g.nodeMinW) cols--
  const nodeW = Math.floor(Math.min(g.nodeMaxW, (laneW - (cols - 1) * g.colGap) / cols))
  // Spring/Summer sits on the Winter side: it follows Winter, and the Fall side stays Fall.
  const colX = (lane: TreeLane, col: number) =>
    lane === 'fall'
      ? Math.round(trunkX - trunkWidth / 2 - g.innerGap - (col + 1) * nodeW - col * g.colGap)
      : Math.round(trunkX + trunkWidth / 2 + g.innerGap + col * (nodeW + g.colGap))

  // Rows per year, and where its Spring/Summer rows start: above every Fall and Winter row, since
  // it's the last term of the year (0 rows of Spring/Summer: none).
  const rowsInYear = new Map<number, { rows: number; base: number; summer: number }>()
  for (let year = 1; year <= maxYear; year++) {
    const inYear = [...drafts.values()]
      .filter((d) => d.year === year)
      .sort(
        (a, b) =>
          a.tier - b.tier ||
          STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
          Number(!!a.elective) - Number(!!b.elective) ||
          b.creds.length - a.creds.length ||
          unlockCount(b.code) - unlockCount(a.code) ||
          a.code.localeCompare(b.code),
      )
    const taken = { fall: new Map<number, boolean[]>(), winter: new Map<number, boolean[]>(), summer: new Map<number, boolean[]>() }
    const slot = (lane: TreeLane, row: number) => {
      if (!taken[lane].has(row)) taken[lane].set(row, new Array(cols).fill(false))
      return taken[lane].get(row)!
    }
    let rows = 0
    let base = 0
    const summer = inYear.filter((d) => d.lane === 'summer')
    for (const d of [...inYear.filter((d) => d.lane !== 'summer'), ...summer]) {
      const lane = d.lane!
      if (lane === 'summer' && d === summer[0]) base = rows
      let row = Math.max(
        lane === 'summer' ? base : 0,
        ...links
          .filter((l) => l.sequencing && l.to === d.code && sameSide(l.from, d.code))
          .map((l) => drafts.get(l.from)!.row + 1),
      )
      for (;; row++) {
        const cells = slot(lane, row)
        // Electives take the outer edge of their lane, like the dashed boxes on the whiteboard.
        const col = d.elective ? (cells[cols - 1] ? -1 : cols - 1) : cells.indexOf(false)
        if (col < 0) continue
        cells[col] = true
        d.row = row
        d.col = col
        break
      }
      rows = Math.max(rows, d.row + 1)
    }
    rowsInYear.set(year, { rows, base: summer.length > 0 ? base : rows, summer: summer.length > 0 ? rows - base : 0 })
  }

  // ── the canopy: the hero crowns the trunk, the rest branch off in pairs below it ──
  const leafCount = Math.min(targets.length, MAX_LEAVES)
  // Two badges a side only where each still has room for its name on two clean lines.
  const perSide = !g.compact && (laneW - g.colGap) / 2 >= 176 ? 2 : 1
  const leafW = perSide === 1 ? Math.floor(laneW) : Math.floor((laneW - g.colGap) / 2)
  const heroW = Math.min(g.compact ? 220 : 300, Math.floor(laneW * 1.3))
  interface LeafSlot { row: number; side: -1 | 0 | 1; col: number }
  const slots: LeafSlot[] = []
  for (let i = 1; i < leafCount; i++) {
    const k = i - 1
    const row = Math.floor(k / (perSide * 2))
    const within = k % (perSide * 2)
    slots.push({ row, side: within % 2 === 0 ? -1 : 1, col: Math.floor(within / 2) })
  }
  const canopyRows = leafCount > 1 ? Math.ceil((leafCount - 1) / (perSide * 2)) : 0
  const leafPitch = g.leafH + g.leafGap
  // The degree readout, when the degree is mapped, takes the top of the canopy above the leaves.
  const degreeH = input.degree ? g.degreeH : 0
  const canopyH = (leafCount === 0 ? 72 : g.canopyTop + (canopyRows + 1) * leafPitch + 8) + degreeH

  // ── bands, top to bottom: canopy, the years from the last down to Year 1, the roots ──
  const bands: TreeBand[] = []
  bands.push({ key: 'canopy', kind: 'canopy', year: 0, label: 'Canopy', y: 0, h: canopyH, current: false, heads: [] })
  let y = canopyH
  const bandY = new Map<number, { y: number; h: number }>()
  const stackH = (rows: number) => (rows === 0 ? 0 : rows * g.nodeH + (rows - 1) * g.rowGap)
  for (let year = maxYear; year >= 1; year--) {
    const { rows, base, summer } = rowsInYear.get(year) ?? { rows: 0, base: 0, summer: 0 }
    const lift = summer > 0 ? g.summerGap : 0
    const h = rows === 0 ? g.emptyBand : g.bandTop + stackH(rows) + lift + g.bandBottom
    // Calendar terms only from this year up: an earlier year's cards are placed by level, not dated.
    const ay = baseAY + year - currentYear
    const head = (season: Season) => (year >= currentYear ? `${season} ${season === 'Fall' ? ay : ay + 1}` : season)
    // A year with Spring/Summer: its head at the top, over its rows; Fall and Winter's just above theirs.
    const low = base > 0 ? h - g.bandBottom - stackH(base) - 22 : 12
    const heads: TreeBand['heads'] =
      summer > 0
        ? [
            { lane: 'summer', label: head('Spring/Summer'), y: 12 },
            { lane: 'fall', label: head('Fall'), y: low },
            ...(base > 0 ? [{ lane: 'winter' as const, label: head('Winter'), y: low }] : []),
          ]
        : [
            { lane: 'fall', label: head('Fall'), y: 12 },
            { lane: 'winter', label: head('Winter'), y: 12 },
          ]
    bands.push({ key: `year-${year}`, kind: 'year', year, label: `Year ${year}`, y, h, current: started && year === currentYear, heads })
    bandY.set(year, { y, h })
    y += h
  }
  const trunkBase = y
  // A sapling (nothing completed yet) gets a line of encouragement under its roots.
  const rootsH = g.rootsH + (completed.size === 0 ? 44 : 0)
  bands.push({ key: 'roots', kind: 'roots', year: 0, label: 'Roots', y, h: rootsH, current: false, heads: [] })
  const height = y + rootsH
  const trunkTop = canopyH

  const nodes: TreeNode[] = [...drafts.values()]
    .sort((a, b) => a.year - b.year || a.row - b.row || LANE_ORDER[a.lane!] - LANE_ORDER[b.lane!] || a.col - b.col)
    .map((d) => {
      const band = bandY.get(d.year)!
      const bottom = band.y + band.h - g.bandBottom - (d.lane === 'summer' ? g.summerGap : 0)
      return {
        code: d.code,
        status: d.status,
        year: d.year,
        lane: d.lane!,
        row: d.row,
        col: d.col,
        x: colX(d.lane!, d.col),
        y: Math.round(bottom - (d.row + 1) * g.nodeH - d.row * g.rowGap),
        w: nodeW,
        h: g.nodeH,
        term: d.term,
        termKnown: d.termKnown,
        current: d.current,
        cu: cuOf(d.code),
        degreeGroup: input.degree?.countsToward[d.code] ?? null,
        creds: d.creds.filter((c) => c < leafCount),
        elective: d.elective,
        prereqs: [],
        unlocks: [],
      }
    })
  const byCode = new Map(nodes.map((n) => [n.code, n]))

  // Keep only links that run UP the board, or across the trunk from Fall to the same year's Winter
  // side: a course placed by its level can't be sure of the order of a prerequisite in another year,
  // and a trace pointing down would say something the tree doesn't know. The course's sheet still
  // lists every prerequisite.
  const below = (a: TreeNode, b: TreeNode) => a.y > b.y + b.h - 1
  const across = (a: TreeNode, b: TreeNode) => a.year === b.year && a.lane === 'fall' && b.lane === 'winter'
  const upward = links.filter((l) => {
    const a = byCode.get(l.from)!
    const b = byCode.get(l.to)!
    return below(a, b) || across(a, b) || (a.year === b.year && a.lane === b.lane && a.row < b.row)
  })
  for (const l of upward) {
    byCode.get(l.to)!.prereqs.push(l.from)
    byCode.get(l.from)!.unlocks.push(l.to)
  }

  // ── leaves and the order of the rails in the trunk ──
  const leafBottom = (row: number) => trunkTop - 8 - row * leafPitch - g.leafGap
  const leaves: TreeLeaf[] = targets.slice(0, leafCount).map((t, index) => {
    const slot = index === 0 ? { row: canopyRows, side: 0 as const, col: 0 } : slots[index - 1]
    const w = slot.side === 0 ? heroW : leafW
    const x =
      slot.side === 0
        ? Math.round(trunkX - w / 2)
        : slot.side < 0
          ? colX('fall', 0) + nodeW - (slot.col + 1) * w - slot.col * g.colGap
          : colX('winter', 0) + slot.col * (w + g.colGap)
    const codes = nodes.filter((n) => n.creds.includes(index)).map((n) => n.code)
    const planOrder = input.plan.flatMap((term) => term.courses.map((c) => c.code))
    const next =
      (beacon && codes.includes(beacon) ? beacon : null) ??
      planOrder.find((c) => codes.includes(c)) ??
      null
    return {
      index,
      id: t.id,
      name: t.name,
      kind: t.kind,
      done: t.done,
      total: t.total,
      planned: t.planned,
      x,
      y: leafBottom(slot.row) - g.leafH,
      w,
      h: g.leafH,
      codes,
      next,
    }
  })
  // ── the wood: a tapered trunk, soft twigs, the crown's branches, a few roots ──
  const base = trunkBase + 12
  const steps = Math.max(12, Math.round((base - trunkTop) / 20))
  const left: string[] = []
  const right: string[] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps // 0 at the roots, 1 at the crown
    const ty = base - (base - trunkTop) * t
    const w = g.trunkTopW + (g.trunkW - g.trunkTopW) * Math.pow(1 - t, 1.7) + (t < 0.04 ? (0.04 - t) * 180 : 0)
    const cx = trunkX + Math.sin(t * Math.PI * 1.3) * g.sway
    left.push(`${(cx - w / 2).toFixed(1)} ${ty.toFixed(1)}`)
    right.unshift(`${(cx + w / 2).toFixed(1)} ${ty.toFixed(1)}`)
  }
  const trunk = `M ${[...left, ...right].join(' L ')} Z`
  const trunkLine = `M ${trunkX} ${base} L ${trunkX} ${trunkTop}`

  // A twig: a short S-curve out of the trunk, rising a little to the card. A card further out reaches
  // the trunk through the gap under its row, behind its neighbour.
  const twigs = nodes.map((n) => {
    const dir = n.lane === 'fall' ? -1 : 1
    if (n.col === 0) {
      const edge = n.lane === 'fall' ? n.x + n.w : n.x
      const cy = Math.round(n.y + n.h / 2)
      const gap = Math.abs(edge - trunkX)
      return { code: n.code, d: `M ${trunkX} ${cy + 12} C ${trunkX + dir * gap * 0.6} ${cy + 12}, ${edge - dir * gap * 0.5} ${cy}, ${edge} ${cy}` }
    }
    const anchor = n.lane === 'fall' ? n.x + n.w - 22 : n.x + 22
    const under = Math.round(n.y + n.h + g.rowGap / 2)
    return { code: n.code, d: `M ${trunkX} ${under + 6} C ${(trunkX + anchor) / 2} ${under + 6}, ${anchor} ${under + 4}, ${anchor} ${n.y + n.h}` }
  })

  // The crown: a smooth branch from the top of the trunk to each leaf.
  const crown = trunkTop + 6
  const branches = leaves.map((leaf) => {
    const lx = Math.round(leaf.x + leaf.w / 2)
    const ly = leaf.y + leaf.h
    if (leaf.index === 0) return { leaf: 0, d: `M ${trunkX} ${crown} L ${trunkX} ${ly}` }
    const rise = crown - ly
    return { leaf: leaf.index, d: `M ${trunkX} ${crown} C ${trunkX} ${crown - rise * 0.6}, ${lx} ${ly + rise * 0.45}, ${lx} ${ly}` }
  })

  // Roots: a few soft lines spreading out and down from the base.
  const depth = g.compact ? 64 : 76
  const spread = g.compact ? 120 : 190
  const roots = [-1, -0.5, 0, 0.5, 1].map((k, i) => {
    const ex = Math.round(trunkX + k * spread)
    const ey = Math.round(trunkBase + depth * (1 - Math.abs(k) * 0.3))
    return {
      d: `M ${trunkX + k * 4} ${trunkBase + 6} C ${trunkX + k * 10} ${trunkBase + depth * 0.5}, ${trunkX + k * spread * 0.55} ${ey - 6}, ${ex} ${ey}`,
      w: [1.6, 2.4, 3, 2.4, 1.6][i],
    }
  })

  // Prerequisite links, drawn only for the course you pick: out of the top of the prerequisite,
  // up into the bottom of what it unlocks, ending in an arrowhead. A course stacked straight above
  // its prerequisite gets a short straight arrow; everything else a curve that arrives vertically.
  // A Fall prerequisite beside its Winter course goes across the trunk instead: out of the card's
  // trunk-side edge, into the other's, arriving horizontally.
  const ARROW = 7
  const treeLinks: TreeLink[] = upward.map((l) => {
    const a = byCode.get(l.from)!
    const b = byCode.get(l.to)!
    if (across(a, b) && !below(a, b)) {
      const x1 = a.x + a.w
      const y1 = Math.round(a.y + a.h / 2)
      const tip = b.x
      const y2 = Math.round(b.y + b.h / 2)
      const end = tip - ARROW
      const k = Math.max(12, (end - x1) / 2)
      const d = `M ${x1} ${y1} C ${x1 + k} ${y1}, ${end - k} ${y2}, ${end} ${y2}`
      const arrow = `M ${end - 1} ${y2 - 4.5} L ${tip} ${y2} L ${end - 1} ${y2 + 4.5} Z`
      const chord = Math.hypot(end - x1, y2 - y1)
      const length = Math.round((chord + k + Math.hypot(end - x1 - 2 * k, y2 - y1) + k) / 2)
      return { from: l.from, to: l.to, conditional: l.conditional, d, arrow, length }
    }
    const x1 = Math.round(a.x + a.w / 2)
    const x2 = Math.round(b.x + b.w / 2)
    const tip = b.y + b.h
    const end = tip + ARROW
    const arrow = `M ${x2 - 4.5} ${end + 1} L ${x2} ${tip} L ${x2 + 4.5} ${end + 1} Z`
    const stacked = Math.abs(x1 - x2) < 24 && a.y - tip < 48
    const k = Math.max(24, Math.min(110, (a.y - end) / 2))
    const d = stacked ? `M ${x1} ${a.y} L ${x2} ${end}` : `M ${x1} ${a.y} C ${x1} ${a.y - k}, ${x2} ${end + k}, ${x2} ${end}`
    // A cubic's length sits between its chord and its control polygon; their mean is close enough.
    const chord = Math.hypot(x2 - x1, a.y - end)
    const length = Math.round(stacked ? chord : (chord + k + Math.hypot(x2 - x1, a.y - end - 2 * k) + k) / 2)
    return { from: l.from, to: l.to, conditional: l.conditional, d, arrow, length }
  })

  // ── the degree: a readout at the top of the canopy, milestones on the trunk ──
  // A milestone sits on the boundary above the year in which the tree's credit units (done, now and
  // planned, in term order) first reach it: admission to the major at 30 cu between Year 1 and Year 2.
  const cuThrough = new Map<number, number>()
  let running = 0
  for (let year = 1; year <= maxYear; year++) {
    running += nodes.filter((n) => n.year === year).reduce((sum, n) => sum + n.cu, 0)
    cuThrough.set(year, running)
  }
  const degree = input.degree ?? null
  const milestones: TreeMilestone[] = (degree?.milestones ?? []).flatMap((ms) => {
    const year = [...cuThrough].find(([, cu]) => cu >= ms.afterCu)?.[0]
    if (year === undefined) return []
    return [{ id: ms.id, label: ms.label, detail: ms.detail, afterCu: ms.afterCu, y: bandY.get(year)!.y, reached: degree!.doneCu >= ms.afterCu }]
  })
  const readoutW = Math.min(width - 32, 460)

  return {
    width,
    height,
    compact: g.compact,
    bands,
    degree: degree ? { progress: degree, x: Math.round((width - readoutW) / 2), y: g.canopyTop, w: readoutW, h: degreeH - 14 } : null,
    milestones,
    termLoad,
    summerLoad,
    nodes,
    leaves,
    links: treeLinks,
    trunk,
    trunkLine,
    twigs,
    branches,
    roots,
    trunkX,
    trunkWidth,
    trunkBase,
    trunkTop,
    currentYear,
  }
}

// ─────────────────────────────────────────────────────────────── queries for the UI

/** Everything under a course (its prerequisite chain to the roots) and over it (what it unlocks, up to the leaves). */
export function pathThrough(layout: SkillTreeLayout, code: string): { codes: Set<string>; creds: Set<number> } {
  const byCode = new Map(layout.nodes.map((n) => [n.code, n]))
  const walk = (next: (n: TreeNode) => string[]) => {
    const seen = new Set<string>([code])
    const queue = [code]
    while (queue.length > 0) {
      for (const c of next(byCode.get(queue.shift()!)!)) {
        if (seen.has(c) || !byCode.has(c)) continue
        seen.add(c)
        queue.push(c)
      }
    }
    return seen
  }
  const down = walk((n) => n.prereqs)
  const up = walk((n) => n.unlocks)
  // The branches it feeds: its own credentials and those of everything it unlocks.
  const creds = new Set([...up].flatMap((c) => byCode.get(c)?.creds ?? []))
  return { codes: new Set([...down, ...up]), creds }
}

/**
 * The leaves, in the order they're drawn: what's being planned (the hero first), then any certificate
 * or minor the student is partway through without having planned it. Capped at the five hues.
 */
export function treeTargets(
  planned: { match: SpecializationMatch; kind: TreeTargetKind }[],
  partway: { match: SpecializationMatch; kind: TreeTargetKind }[],
): SkillTreeTarget[] {
  const seen = new Set<string>()
  const out: SkillTreeTarget[] = []
  const push = ({ match, kind }: { match: SpecializationMatch; kind: TreeTargetKind }, isPlanned: boolean) => {
    if (seen.has(match.spec.id) || match.totalRequired === 0) return
    seen.add(match.spec.id)
    out.push({
      id: match.spec.id,
      name: match.spec.name,
      kind,
      done: match.doneCount,
      total: match.totalRequired,
      groups: match.spec.requirements,
      planned: isPlanned,
    })
  }
  for (const p of planned) push(p, true)
  for (const p of partway) if (p.match.doneCount > 0 && p.match.remaining > 0) push(p, false)
  return out.slice(0, MAX_LEAVES)
}

// currentTermOf moved to plan.ts (api/max/call.ts needs it too, server-side) — re-exported here so
// existing imports from this module (src/skilltree/planView.ts, scripts/check-skill-tree.ts) don't break.
export { currentTermOf }

/** The season a lane stands for. */
export function laneSeason(lane: TreeLane): Season {
  return lane === 'fall' ? 'Fall' : lane === 'winter' ? 'Winter' : 'Spring/Summer'
}
