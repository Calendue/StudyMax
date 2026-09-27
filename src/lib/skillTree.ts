import { courseInfo } from '../data/prereqs.ts'
import type { RequirementGroup } from '../data/specializations.ts'
import type { SpecializationMatch } from './match.ts'
import { courseLevel, upcomingTerm, type PlannedTerm, type Season, type TermStart } from './plan.ts'

// The Academic Skill Tree: the student's degree drawn as a circuit board that grows UP. Roots at the
// bottom, Year 1 above them, the years rising to a canopy of the credentials they're working toward.
// Fall courses sit left of the trunk and Winter courses right of it.
//
// Pure and React-free, like roadmapLayout.ts: it consumes buildStudentPlan's output and the match
// engine's targets as they are, and only decides where things go and how the traces run. It never
// schedules anything itself and never invents a course.
//
// The trunk is the board's BUS (Prospector Studio's backplane): one rail per credential, running up
// the middle. A course TAPS into the rail of every credential it counts toward (a via on each), so
// forty courses don't each draw a cable to the canopy; at the top the rails branch out to their
// leaves. Prerequisite links are routed ORTHOGONALLY around the course cards, through the channels
// between rows and the gutters between columns, by a cheapest-path search that charges for every
// turn (Prospector's tracks.ts, in small), so a trace takes the long straight run a person would draw.

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

export type TraceKind = 'trunk' | 'rail' | 'tap' | 'prereq' | 'root'
/** lit: current flows (from a completed course). live: in progress. idle: planned. locked: can't yet. */
export type TraceState = 'lit' | 'live' | 'idle' | 'locked'

export interface TreeTrace {
  id: string
  kind: TraceKind
  d: string
  state: TraceState
  /** For prereq traces: prerequisite → dependent. For taps: the course. */
  from?: string
  to?: string
  /** Credential (leaf index) whose hue the trace carries: rails and taps. */
  cred?: number
  /** An OR-option ("CMPT 260 or CMPT 263"): drawn with a dashed stripe. */
  conditional?: boolean
}

export interface TreeVia {
  x: number
  y: number
  cred: number
  code: string
  lit: boolean
}

export interface SkillTreeLayout {
  width: number
  height: number
  compact: boolean
  bands: TreeBand[]
  nodes: TreeNode[]
  leaves: TreeLeaf[]
  traces: TreeTrace[]
  vias: TreeVia[]
  trunkX: number
  trunkWidth: number
  /** Where the trunk meets the roots, and where it forks into the canopy. */
  trunkBase: number
  trunkTop: number
  currentYear: number
  /** Each leaf's rail x inside the trunk, by leaf index. */
  railX: number[]
}

/** Five credential hues (see skilltree.css); more leaves than that would stop being distinguishable. */
export const MAX_LEAVES = 5

const STATUS_RANK: Record<TreeStatus, number> = { completed: 0, inProgress: 1, next: 2, planned: 2, locked: 3 }

/** The academic year a term belongs to: Fall Y and Winter Y+1 are one year. */
function academicYear(term: TermStart) {
  return term.season === 'Fall' ? term.year : term.year - 1
}

function parseTerm(label: string): TermStart | null {
  const [season, year] = label.split(' ')
  return (season === 'Fall' || season === 'Winter') && Number(year) > 0 ? { season, year: Number(year) } : null
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
  railGap: number
  bandTop: number
  bandBottom: number
  emptyBand: number
  maxCols: number
  leafH: number
  leafGap: number
  canopyTop: number
  rootsH: number
  corner: number
}

function geometry(width: number): Geometry {
  const compact = width < 560
  return compact
    ? { compact, gutter: 22, pad: 8, nodeMinW: 58, nodeMaxW: 76, nodeH: 40, colGap: 10, rowGap: 22, innerGap: 14, railGap: 4, bandTop: 34, bandBottom: 16, emptyBand: 76, maxCols: 2, leafH: 66, leafGap: 22, canopyTop: 16, rootsH: 178, corner: 6 }
    : { compact, gutter: 34, pad: 16, nodeMinW: 108, nodeMaxW: 136, nodeH: 50, colGap: 14, rowGap: 26, innerGap: 20, railGap: 5, bandTop: 40, bandBottom: 18, emptyBand: 88, maxCols: 3, leafH: 76, leafGap: 26, canopyTop: 20, rootsH: 200, corner: 8 }
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

  for (const code of [...completed].sort()) {
    add(code, {
      status: 'completed',
      year: Math.min(lastDoneYear, Math.max(1, courseLevel(code))),
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
  const firstPlanned = input.plan[0]?.courses.map((c) => c.code).find((c) => drafts.get(c)?.status === 'planned')
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
      if (year === currentYear && current.season === 'Winter') d.lane = 'fall'
      else if (hasPrereq) d.lane = 'winter'
      else if (unlocks) d.lane = 'fall'
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
  const railCount = Math.max(1, Math.min(targets.length, MAX_LEAVES))
  const trunkWidth = (railCount - 1) * g.railGap + 14
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
  const perSide = g.compact ? 1 : 2
  const leafW = g.compact ? Math.floor(laneW) : Math.floor((laneW - g.colGap) / 2)
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
  // The rails that branch off lowest sit outermost on their side, so no branch crosses another.
  const railOrder = [
    ...slots.map((s, i) => ({ ...s, leaf: i + 1 })).filter((s) => s.side < 0).sort((a, b) => a.row - b.row || b.col - a.col),
    ...(leafCount > 0 ? [{ leaf: 0 }] : []),
    ...slots.map((s, i) => ({ ...s, leaf: i + 1 })).filter((s) => s.side > 0).sort((a, b) => b.row - a.row || a.col - b.col),
  ]
  const railX: number[] = new Array(leafCount).fill(trunkX)
  railOrder.forEach((r, i) => {
    railX[r.leaf] = Math.round(trunkX + (i - (railOrder.length - 1) / 2) * g.railGap)
  })

  // ── traces ──
  const traces: TreeTrace[] = []
  const vias: TreeVia[] = []
  const stateOf = (status: TreeStatus): TraceState =>
    status === 'completed' ? 'lit' : status === 'inProgress' ? 'live' : status === 'locked' ? 'locked' : 'idle'

  traces.push({ id: 'trunk', kind: 'trunk', d: `M ${trunkX} ${trunkBase} L ${trunkX} ${trunkTop}`, state: 'lit' })

  // Rails: up the whole trunk, then out along the canopy to their leaf.
  leaves.forEach((leaf) => {
    const x = railX[leaf.index]
    const port = { x: Math.round(leaf.x + leaf.w / 2), y: leaf.y + leaf.h }
    let d: string
    if (leaf.index === 0 || Math.abs(port.x - x) < 1) {
      d = `M ${x} ${trunkBase} L ${x} ${port.y}`
    } else {
      const slot = slots[leaf.index - 1]
      const branchY = port.y + g.leafGap / 2 + (slot.col === 0 ? -3 : 3)
      d = roundedPath([{ x, y: trunkBase }, { x, y: branchY }, { x: port.x, y: branchY }, port], g.corner)
    }
    const lit = nodes.some((n) => n.status === 'completed' && n.creds.includes(leaf.index))
    traces.push({ id: `rail-${leaf.index}`, kind: 'rail', d, state: lit ? 'lit' : 'idle', cred: leaf.index })
  })

  // Taps: each course into the rails it counts toward. The column next to the trunk runs straight
  // in; an outer column climbs into the channel above its row first, so it never crosses a card.
  const trunkEdge = (lane: TreeLane) => (lane === 'fall' ? trunkX - trunkWidth / 2 : trunkX + trunkWidth / 2)
  for (const n of nodes) {
    const inner = n.lane === 'fall' ? n.x + n.w : n.x
    const railsHit = n.creds.map((c) => railX[c])
    const end =
      railsHit.length === 0
        ? trunkEdge(n.lane)
        : n.lane === 'fall'
          ? Math.max(...railsHit)
          : Math.min(...railsHit)
    const tapY = n.col === 0 ? Math.round(n.y + n.h / 2) : Math.round(n.y - g.rowGap / 2 + (n.col - 1) * 3)
    const pts =
      n.col === 0
        ? [{ x: inner, y: tapY }, { x: end, y: tapY }]
        : [
            { x: inner + (n.lane === 'fall' ? -10 : 10), y: n.y },
            { x: inner + (n.lane === 'fall' ? -10 : 10), y: tapY },
            { x: end, y: tapY },
          ]
    const primary = n.creds[0]
    traces.push({
      id: `tap-${n.code}`,
      kind: 'tap',
      d: roundedPath(pts, g.corner),
      state: stateOf(n.status),
      from: n.code,
      cred: primary,
    })
    for (const c of n.creds) vias.push({ x: railX[c], y: tapY, cred: c, code: n.code, lit: n.status === 'completed' })
  }

  // Prerequisite traces, routed around the cards. Several links out of one card leave from spread
  // pins along its top edge, and arrive on spread pins along the bottom of the course they unlock.
  const outs = new Map<string, string[]>()
  const ins = new Map<string, string[]>()
  for (const l of upward) {
    outs.set(l.from, [...(outs.get(l.from) ?? []), l.to])
    ins.set(l.to, [...(ins.get(l.to) ?? []), l.from])
  }
  const pin = (n: TreeNode, list: string[], code: string) => {
    const others = [...list].sort((a, b) => byCode.get(a)!.x - byCode.get(b)!.x)
    const i = others.indexOf(code)
    return Math.round(n.x + (n.w * (i + 1)) / (others.length + 1))
  }
  const router = makeRouter(nodes, bands, g, trunkX, trunkWidth, width)
  upward.forEach((l, i) => {
    const a = byCode.get(l.from)!
    const b = byCode.get(l.to)!
    const from = { x: pin(a, outs.get(a.code)!, b.code), y: a.y }
    const to = { x: pin(b, ins.get(b.code)!, a.code), y: b.y + b.h }
    const pts = router(from, to, a, b, i)
    traces.push({
      id: `pre-${l.from}-${l.to}`,
      kind: 'prereq',
      d: roundedPath(pts, g.corner),
      state: a.status === 'completed' && (b.status === 'completed' || b.status === 'inProgress') ? 'lit' : stateOf(b.status),
      from: l.from,
      to: l.to,
      conditional: l.conditional,
    })
  })

  // Roots: the rails run on below the trunk and fan out into a row of pads, like pins into a header.
  const rootPads = Math.max(5, leafCount + 2)
  const padSpan = Math.min(width - g.gutter - g.pad - 40, g.compact ? 240 : 420)
  const padY = trunkBase + (g.compact ? 76 : 90)
  for (let i = 0; i < rootPads; i++) {
    const px = Math.round(trunkX - padSpan / 2 + (padSpan * i) / (rootPads - 1))
    const sx = Math.round(trunkX + (i - (rootPads - 1) / 2) * g.railGap * 0.9)
    const bendY = trunkBase + 14 + Math.abs(i - (rootPads - 1) / 2) * 7
    traces.push({
      id: `root-${i}`,
      kind: 'root',
      d: roundedPath([{ x: sx, y: trunkBase }, { x: sx, y: bendY }, { x: px, y: bendY }, { x: px, y: padY }], g.corner),
      state: 'lit',
    })
  }

  return { width, height, compact: g.compact, bands, nodes, leaves, traces, vias, trunkX, trunkWidth, trunkBase, trunkTop, currentYear, railX }
}

// ─────────────────────────────────────────────────────────────── routing (tracks.ts, in small)

interface Pt {
  x: number
  y: number
}

/** Rounded corners, the way a track on a board turns. Collinear points are dropped first. */
export function roundedPath(raw: Pt[], radius: number): string {
  const pts: Pt[] = []
  for (const p of raw) {
    const n = pts.length
    if (n && pts[n - 1].x === p.x && pts[n - 1].y === p.y) continue
    if (n >= 2) {
      const a = pts[n - 2]
      const b = pts[n - 1]
      if ((a.x === b.x && b.x === p.x) || (a.y === b.y && b.y === p.y)) {
        pts[n - 1] = p
        continue
      }
    }
    pts.push(p)
  }
  if (pts.length < 2) return ''
  let d = `M ${pts[0].x} ${pts[0].y}`
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i]
    const prev = pts[i - 1]
    const next = pts[i + 1]
    const r = Math.min(radius, Math.hypot(p.x - prev.x, p.y - prev.y) / 2, Math.hypot(next.x - p.x, next.y - p.y) / 2)
    if (r < 1) {
      d += ` L ${p.x} ${p.y}`
      continue
    }
    const inX = Math.sign(p.x - prev.x)
    const inY = Math.sign(p.y - prev.y)
    const outX = Math.sign(next.x - p.x)
    const outY = Math.sign(next.y - p.y)
    d += ` L ${p.x - inX * r} ${p.y - inY * r} Q ${p.x} ${p.y} ${p.x + outX * r} ${p.y + outY * r}`
  }
  const last = pts[pts.length - 1]
  return `${d} L ${last.x} ${last.y}`
}

/** A turn costs this many pixels of travel: a straight run wins over a staircase, a real detour still happens. */
const TURN_COST = 60
/** Where in a channel each trace runs, interleaved so neighbouring traces land apart. */
const SPREAD = [0, 4, -4, 2, -2, 6, -6, 1, -1, 5, -5, 3, -3]

/**
 * The board's free lines, built once: the channels between rows (and a year's top and bottom
 * margins) and the gutters between columns and beside the trunk. A trace only ever runs along
 * these, which is why the result looks like a board rather than a maze solution. Each route is the
 * cheapest path across the lattice, where every turn costs TURN_COST.
 */
function makeRouter(nodes: TreeNode[], bands: TreeBand[], g: Geometry, trunkX: number, trunkWidth: number, width: number) {
  const baseYs = new Set<number>()
  const byYear = new Map<number, TreeNode[]>()
  for (const n of nodes) byYear.set(n.year, [...(byYear.get(n.year) ?? []), n])
  for (const band of bands) {
    if (band.kind !== 'year') continue
    const list = byYear.get(band.year) ?? []
    const rowTops = [...new Set(list.map((n) => n.y))].sort((a, b) => a - b)
    if (rowTops.length === 0) {
      baseYs.add(Math.round(band.y + band.h / 2))
      continue
    }
    baseYs.add(Math.round(band.y + (rowTops[0] - band.y) / 2 + 4))
    for (const top of rowTops.slice(1)) baseYs.add(Math.round(top - g.rowGap / 2))
    baseYs.add(Math.round(rowTops[rowTops.length - 1] + g.nodeH + g.bandBottom / 2))
  }
  const colEdges = [...new Set(nodes.map((n) => `${n.x}:${n.w}`))].map((s) => s.split(':').map(Number))
  const baseXs = new Set<number>()
  const trunkL = trunkX - trunkWidth / 2
  const trunkR = trunkX + trunkWidth / 2
  const xsSorted = [...new Set(colEdges.map(([x]) => x))].sort((a, b) => a - b)
  const w = nodes[0]?.w ?? 0
  for (const x of xsSorted) {
    baseXs.add(Math.round(x - g.colGap / 2))
    baseXs.add(Math.round(x + w + g.colGap / 2))
  }
  baseXs.add(Math.round(trunkL - g.innerGap / 2))
  baseXs.add(Math.round(trunkR + g.innerGap / 2))
  const minX = g.gutter - 2
  const maxX = width - 4
  const rects = nodes.map((n) => ({ code: n.code, x: n.x - 2, y: n.y - 2, x2: n.x + n.w + 2, y2: n.y + n.h + 2 }))

  return (from: Pt, to: Pt, a: TreeNode, b: TreeNode, index: number): Pt[] => {
    const spread = SPREAD[index % SPREAD.length]
    const dy = Math.max(-(g.rowGap / 2 - 3), Math.min(g.rowGap / 2 - 3, spread))
    const dx = Math.max(-(g.colGap / 2 - 2), Math.min(g.colGap / 2 - 2, spread / 2))
    // Out of the source's top into the channel above it; into the target from the channel below it.
    const p1 = { x: from.x, y: Math.round(a.y - g.rowGap / 2 + dy) }
    const p2 = { x: to.x, y: Math.round(b.y + b.h + g.rowGap / 2 + dy) }
    if (p1.y < p2.y) {
      // Same row band edge case (level link across the trunk): a straight hop through the channel.
      const mid = Math.round((a.y + b.y + b.h) / 2)
      return [from, { x: from.x, y: mid }, { x: to.x, y: mid }, to]
    }
    const xs = [...new Set([...[...baseXs].map((x) => Math.round(x + dx)), p1.x, p2.x])]
      .filter((x) => x >= minX && x <= maxX && (x <= trunkL - 1 || x >= trunkR + 1 || x === p1.x || x === p2.x))
      .sort((m, n) => m - n)
    const ys = [...new Set([...[...baseYs].map((y) => Math.round(y + dy)), p1.y, p2.y])]
      .filter((y) => y >= p2.y - 1 && y <= p1.y + 1)
      .sort((m, n) => m - n)
    const obstacles = rects.filter((r) => r.code !== a.code && r.code !== b.code)
    const blocked = (x1: number, y1: number, x2: number, y2: number) => {
      if (x1 === x2 && x1 > trunkL - 1 && x1 < trunkR + 1) return true
      const lx = Math.min(x1, x2)
      const hx = Math.max(x1, x2)
      const ly = Math.min(y1, y2)
      const hy = Math.max(y1, y2)
      return obstacles.some((r) => lx < r.x2 && hx > r.x && ly < r.y2 && hy > r.y)
    }
    const path = cheapest(xs, ys, p1, p2, blocked)
    return path ? [from, ...path, to] : [from, p1, { x: p2.x, y: p1.y }, p2, to]
  }
}

/** Dijkstra over (column, row, axis arrived on), with a cost for every change of axis. */
function cheapest(xs: number[], ys: number[], p1: Pt, p2: Pt, blocked: (x1: number, y1: number, x2: number, y2: number) => boolean): Pt[] | null {
  const W = xs.length
  const H = ys.length
  const sx = xs.indexOf(p1.x)
  const sy = ys.indexOf(p1.y)
  const tx = xs.indexOf(p2.x)
  const ty = ys.indexOf(p2.y)
  if (sx < 0 || sy < 0 || tx < 0 || ty < 0) return null
  const key = (cx: number, cy: number, axis: number) => (cy * W + cx) * 2 + axis
  const dist = new Float64Array(W * H * 2).fill(Infinity)
  const prev = new Int32Array(W * H * 2).fill(-1)
  const heap: [number, number][] = []
  const push = (k: number, d: number) => {
    dist[k] = d
    heap.push([d, k])
    let i = heap.length - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if (heap[p][0] < heap[i][0] || (heap[p][0] === heap[i][0] && heap[p][1] <= heap[i][1])) break
      ;[heap[p], heap[i]] = [heap[i], heap[p]]
      i = p
    }
  }
  const pop = () => {
    const top = heap[0]
    const last = heap.pop()!
    if (heap.length > 0) {
      heap[0] = last
      let i = 0
      for (;;) {
        const l = i * 2 + 1
        const r = l + 1
        let m = i
        const less = (u: number, v: number) => heap[u][0] < heap[v][0] || (heap[u][0] === heap[v][0] && heap[u][1] < heap[v][1])
        if (l < heap.length && less(l, m)) m = l
        if (r < heap.length && less(r, m)) m = r
        if (m === i) break
        ;[heap[m], heap[i]] = [heap[i], heap[m]]
        i = m
      }
    }
    return top
  }
  // It arrives in the channel vertically (out of the card's top) and must leave it vertically too.
  push(key(sx, sy, 1), 0)
  let end = -1
  while (heap.length > 0) {
    const [d, k] = pop()
    if (d > dist[k]) continue
    const axis = k % 2
    const cell = (k - axis) / 2
    const cx = cell % W
    const cy = (cell - cx) / W
    if (cx === tx && cy === ty) {
      end = k
      if (axis === 1) break
      // Arriving horizontally needs one more turn into the card: keep looking for a cheaper vertical arrival.
      const vertical = key(cx, cy, 1)
      if (d + TURN_COST < dist[vertical]) {
        prev[vertical] = k
        push(vertical, d + TURN_COST)
      }
      continue
    }
    for (const [ddx, ddy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = cx + ddx
      const ny = cy + ddy
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue
      if (blocked(xs[cx], ys[cy], xs[nx], ys[ny])) continue
      const nAxis = ddx !== 0 ? 0 : 1
      const cost = d + Math.abs(xs[nx] - xs[cx]) + Math.abs(ys[ny] - ys[cy]) + (nAxis === axis ? 0 : TURN_COST)
      const nk = key(nx, ny, nAxis)
      if (cost < dist[nk]) {
        prev[nk] = k
        push(nk, cost)
      }
    }
  }
  if (end < 0) return null
  const goal = dist[key(tx, ty, 1)] < Infinity ? key(tx, ty, 1) : end
  const pts: Pt[] = []
  for (let k = goal; k >= 0; k = prev[k]) {
    const cell = (k - (k % 2)) / 2
    const cx = cell % W
    pts.push({ x: xs[cx], y: ys[(cell - cx) / W] })
  }
  return pts.reverse()
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
