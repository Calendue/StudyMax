import { courseInfo } from '../data/prereqs.ts'
import type { RequirementGroup } from '../data/specializations.ts'
import type { SpecializationMatch } from './match.ts'
import { courseLevel, isElective, upcomingTerm, type PlannedTerm, type Season, type TermStart } from './plan.ts'

// The Academic Skill Tree: the student's degree drawn as a tree that grows UP. Roots at the bottom,
// Year 1 above them, the years rising to a canopy of the credentials they're working toward. Fall
// courses sit left of the trunk and Winter courses right of it, each on a short twig.
//
// Pure and React-free, like roadmapLayout.ts: it consumes buildStudentPlan's output and the match
// engine's targets as they are, and only decides where things go and the shape of the wood (a
// tapered trunk, twigs, the crown's branches, a few roots). Prerequisite links are computed as
// smooth curves, and the UI draws them only for the course you select. It never schedules anything
// itself and never invents a course.

export type TreeStatus = 'completed' | 'inProgress' | 'next' | 'planned' | 'locked'
export type TreeLane = 'fall' | 'winter'
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

export interface SkillTreeInput {
  completed: Iterable<string>
  /** Registered now, not finished. A course that's also completed counts as completed. */
  inProgress: Iterable<string>
  plan: PlannedTerm[]
  /** The term being sat right now: where the in-progress courses go. */
  currentTerm: TermStart
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
  /** "Winter 2027", "Fall 2026" (now), or "Year 2" for a completed course (see termKnown). */
  term: string
  /** False for completed courses: the transcript has no term dates, so their place is approximate. */
  termKnown: boolean
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

export interface SkillTreeLayout {
  width: number
  height: number
  compact: boolean
  bands: TreeBand[]
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

/** The academic year a term belongs to: Fall Y and Winter Y+1 are one year. */
function academicYear(term: TermStart) {
  return term.season === 'Fall' ? term.year : term.year - 1
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
    ? { compact, gutter: 24, pad: 10, nodeMinW: 112, nodeMaxW: 172, nodeH: 58, colGap: 10, rowGap: 12, innerGap: 20, bandTop: 38, bandBottom: 14, emptyBand: 64, maxCols: 1, leafH: 64, leafGap: 26, canopyTop: 12, rootsH: 170, trunkW: 18, trunkTopW: 3, sway: 2 }
    : { compact, gutter: 36, pad: 16, nodeMinW: 150, nodeMaxW: 188, nodeH: 62, colGap: 14, rowGap: 16, innerGap: 28, bandTop: 44, bandBottom: 18, emptyBand: 80, maxCols: 2, leafH: 72, leafGap: 30, canopyTop: 16, rootsH: 190, trunkW: 26, trunkTopW: 4, sway: 3 }
}

interface Draft {
  code: string
  status: TreeStatus
  year: number
  lane: TreeLane | null
  term: string
  termKnown: boolean
  creds: number[]
  elective: TreeNode['elective']
  order: number
  tier: number
  row: number
  col: number
}

/** A full-time term's load: completed courses have no dates, so this is what a term on the tree holds. */
const TERM_LOAD = 5

export function layoutSkillTree(input: SkillTreeInput): SkillTreeLayout {
  const g = geometry(Math.max(300, input.width))
  const width = Math.max(300, Math.round(input.width))
  const completed = new Set(input.completed)
  const inProgress = [...new Set(input.inProgress)].filter((c) => !completed.has(c)).sort()
  const doneOrNow = new Set([...completed, ...inProgress])
  const current = input.currentTerm
  const targets = input.targets.slice(0, MAX_LEAVES)

  // ── which year is "now" ──
  // The transcript carries no term dates, so this is an approximation, and says so: a full-time
  // year is about ten courses, and nobody is in an earlier year than their highest completed level
  // (one year later when they're sitting a Fall term: that year's Fall has only just started).
  const levels = [...completed].map((c) => Math.min(4, Math.max(1, courseLevel(c))))
  const topLevel = levels.length > 0 ? Math.max(...levels) : 0
  const currentYear = Math.max(
    1,
    Math.min(4, Math.floor(completed.size / 10) + 1),
    topLevel + (current.season === 'Fall' && topLevel > 0 ? 1 : 0),
  )
  // Completed courses sit in a year that's already over (or in this year's Fall, when it's Winter).
  const lastDoneYear = Math.max(1, current.season === 'Fall' ? currentYear - 1 : currentYear)

  // ── the courses ──
  const drafts = new Map<string, Draft>()
  const credsOf = (code: string) =>
    targets.flatMap((t, i) => (t.groups.some((grp) => grp.courses.includes(code)) ? [i] : []))
  let order = 0
  const add = (code: string, d: Omit<Draft, 'code' | 'creds' | 'order' | 'tier' | 'row' | 'col' | 'elective'>) => {
    if (drafts.has(code)) return
    drafts.set(code, { code, ...d, creds: credsOf(code), elective: null, order: order++, tier: 0, row: 0, col: 0 })
  }

  // By course level, but a year holds two full terms at most: a student who took many 100-level
  // courses took some of them later, so the rest move up a year (never past the last finished one).
  const perYear = new Map<number, number>()
  for (const code of [...completed].sort((a, b) => courseLevel(a) - courseLevel(b) || a.localeCompare(b))) {
    let year = Math.min(lastDoneYear, Math.max(1, courseLevel(code)))
    while (year < lastDoneYear && (perYear.get(year) ?? 0) >= 2 * TERM_LOAD) year++
    perYear.set(year, (perYear.get(year) ?? 0) + 1)
    add(code, {
      status: 'completed',
      year,
      lane: null,
      term: '',
      termKnown: false,
    })
  }
  for (const code of inProgress) {
    add(code, {
      status: 'inProgress',
      year: currentYear,
      lane: current.season === 'Fall' ? 'fall' : 'winter',
      term: `${current.season} ${current.year}`,
      termKnown: true,
    })
  }
  const currentAY = academicYear(current)
  for (const term of input.plan) {
    const t = parseTerm(term.label) ?? current
    for (const course of term.courses) {
      if (drafts.has(course.code)) continue
      add(course.code, {
        status: 'planned',
        year: Math.max(1, currentYear + academicYear(t) - currentAY),
        // Spring/Summer has no lane of its own yet (a thin centre lane later): it sits on the Winter
        // side of its academic year, and the card keeps its real term.
        lane: t.season === 'Fall' ? 'fall' : 'winter',
        term: `${t.season} ${t.year}`,
        termKnown: true,
      })
    }
  }
  for (const d of drafts.values()) {
    if (d.status === 'completed') d.term = `Year ${d.year}`
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
  // An unnamed elective is never the one course to take next: there's nothing specific to take.
  const firstPlanned = input.plan[0]?.courses
    .map((c) => c.code)
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

  // ── lanes for completed courses ──
  // No term dates, so: a course whose prerequisite sits in the same year went in Winter; one that
  // unlocks a course in the same year went in Fall; the rest alternate to balance the two sides, in
  // code order. When it's Winter now, this year's completed courses can only have been in the Fall.
  const sameYear = (a: string, b: string) => drafts.get(a)!.year === drafts.get(b)!.year
  const maxYear = Math.max(4, currentYear, ...[...drafts.values()].map((d) => d.year))
  for (let year = 1; year <= maxYear; year++) {
    const inYear = [...drafts.values()].filter((d) => d.year === year)
    const count = { fall: inYear.filter((d) => d.lane === 'fall').length, winter: inYear.filter((d) => d.lane === 'winter').length }
    const free: Draft[] = []
    for (const d of inYear) {
      if (d.lane) continue
      const seq = links.filter((l) => l.sequencing && drafts.get(l.from)!.status === 'completed' && drafts.get(l.to)!.status === 'completed')
      const hasPrereq = seq.some((l) => l.to === d.code && sameYear(l.from, d.code))
      const unlocks = seq.some((l) => l.from === d.code && sameYear(l.to, d.code))
      // A side that already holds a full term's load passes the course to the other side.
      const room = (lane: 'fall' | 'winter') => count[lane] < TERM_LOAD
      if (year === currentYear && current.season !== 'Fall') d.lane = 'fall'
      else if (hasPrereq && room('winter')) d.lane = 'winter'
      else if (unlocks && room('fall')) d.lane = 'fall'
      if (d.lane) count[d.lane]++
      else free.push(d)
    }
    for (const d of free.sort((a, b) => a.code.localeCompare(b.code))) {
      d.lane = count.fall <= count.winter ? 'fall' : 'winter'
      count[d.lane]++
    }
  }

  // ── rows within each year: prerequisites below what they unlock ──
  const tierOf = (d: Draft, seen = new Set<string>()): number => {
    if (seen.has(d.code)) return 0
    seen.add(d.code)
    const below = links.filter((l) => l.sequencing && l.to === d.code && sameYear(l.from, d.code))
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
  const colX = (lane: TreeLane, col: number) =>
    lane === 'fall'
      ? Math.round(trunkX - trunkWidth / 2 - g.innerGap - (col + 1) * nodeW - col * g.colGap)
      : Math.round(trunkX + trunkWidth / 2 + g.innerGap + col * (nodeW + g.colGap))

  const rowsInYear = new Map<number, number>()
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
    const taken = { fall: new Map<number, boolean[]>(), winter: new Map<number, boolean[]>() }
    const slot = (lane: TreeLane, row: number) => {
      if (!taken[lane].has(row)) taken[lane].set(row, new Array(cols).fill(false))
      return taken[lane].get(row)!
    }
    let rows = 0
    for (const d of inYear) {
      const lane = d.lane!
      let row = Math.max(
        0,
        ...links
          .filter((l) => l.sequencing && l.to === d.code && drafts.get(l.from)!.year === year)
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
    rowsInYear.set(year, rows)
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
  const canopyH = leafCount === 0 ? 72 : g.canopyTop + (canopyRows + 1) * leafPitch + 8

  // ── bands, top to bottom: canopy, the years from the last down to Year 1, the roots ──
  const bands: TreeBand[] = []
  bands.push({ key: 'canopy', kind: 'canopy', year: 0, label: 'Canopy', y: 0, h: canopyH, current: false })
  let y = canopyH
  const bandY = new Map<number, { y: number; h: number }>()
  for (let year = maxYear; year >= 1; year--) {
    const rows = rowsInYear.get(year) ?? 0
    const h = rows === 0 ? g.emptyBand : g.bandTop + rows * g.nodeH + (rows - 1) * g.rowGap + g.bandBottom
    bands.push({ key: `year-${year}`, kind: 'year', year, label: `Year ${year}`, y, h, current: year === currentYear })
    bandY.set(year, { y, h })
    y += h
  }
  const trunkBase = y
  // A sapling (nothing completed yet) gets a line of encouragement under its roots.
  const rootsH = g.rootsH + (completed.size === 0 ? 44 : 0)
  bands.push({ key: 'roots', kind: 'roots', year: 0, label: 'Roots', y, h: rootsH, current: false })
  const height = y + rootsH
  const trunkTop = canopyH

  const nodes: TreeNode[] = [...drafts.values()]
    .sort((a, b) => a.year - b.year || a.row - b.row || (a.lane === b.lane ? a.col - b.col : a.lane === 'fall' ? -1 : 1))
    .map((d) => {
      const band = bandY.get(d.year)!
      const bottom = band.y + band.h - g.bandBottom
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
        creds: d.creds.filter((c) => c < leafCount),
        elective: d.elective,
        prereqs: [],
        unlocks: [],
      }
    })
  const byCode = new Map(nodes.map((n) => [n.code, n]))

  // Keep only links that run UP the board (or level, across the trunk): a course placed by its
  // level can't be sure of the order of a prerequisite in another year, and a trace pointing down
  // would say something the tree doesn't know. The course's sheet still lists every prerequisite.
  const upward = links.filter((l) => {
    const a = byCode.get(l.from)!
    const b = byCode.get(l.to)!
    return a.y > b.y + b.h - 1 || (a.year === b.year && a.row < b.row)
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
  const ARROW = 7
  const treeLinks: TreeLink[] = upward.map((l) => {
    const a = byCode.get(l.from)!
    const b = byCode.get(l.to)!
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

  return {
    width,
    height,
    compact: g.compact,
    bands,
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

/** The term being sat now: the one before the term a student would register for next. */
export function currentTermOf(today: Date): TermStart {
  const next = upcomingTerm(today)
  return next.season === 'Fall' ? { season: 'Winter', year: next.year } : { season: 'Fall', year: next.year - 1 }
}

/** The season a lane stands for. */
export function laneSeason(lane: TreeLane): Season {
  return lane === 'fall' ? 'Fall' : 'Winter'
}
