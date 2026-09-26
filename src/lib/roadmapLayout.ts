import type { PlannedTerm } from './plan.ts'

export type RoadmapNodeState = 'requirement' | 'prerequisite'

export interface RoadmapNodeLayout {
  code: string
  state: RoadmapNodeState
  neededBy?: string
  prerequisiteText?: string
  alsoAdvances: string[]
  /** Which term (top to bottom). */
  row: number
  /** Position within the term (left to right). */
  col: number
  /** How many courses share this term, so the row can split the full width between them. */
  rowSize: number
}

export interface RoadmapRow {
  key: string
  label: string
  codes: string[]
}

export interface RoadmapEdge {
  from: string
  to: string
}

export interface RoadmapLayout {
  rows: RoadmapRow[]
  nodes: RoadmapNodeLayout[]
  edges: RoadmapEdge[]
}

/**
 * Turns the plan's term buckets into grid positions: one row per term, top to bottom, courses
 * spread across the row in the order the plan already computed. Pure and React-free — `buildPlan`
 * already did the hard part (topological order, term batching); this only assigns positions.
 */
export function buildRoadmapLayout(terms: PlannedTerm[]): RoadmapLayout {
  const rows: RoadmapRow[] = []
  const nodes: RoadmapNodeLayout[] = []
  const neededByCode = new Map<string, string>()

  terms.forEach((term, row) => {
    rows.push({ key: term.label, label: term.label, codes: term.courses.map((c) => c.code) })
    term.courses.forEach((c, col) => {
      nodes.push({
        code: c.code,
        state: c.reason === 'prerequisite' ? 'prerequisite' : 'requirement',
        neededBy: c.neededBy,
        prerequisiteText: c.prerequisiteText,
        alsoAdvances: c.alsoAdvances,
        row,
        col,
        rowSize: term.courses.length,
      })
      if (c.neededBy) neededByCode.set(c.code, c.neededBy)
    })
  })

  // `neededBy` always points at a course still being planned (a satisfied prerequisite is never
  // queued), and `buildPlan` never schedules a course in the same term as its prerequisite, so every
  // edge runs strictly downward. The filter is only a guard against a future data shape change.
  const knownCodes = new Set(nodes.map((n) => n.code))
  const edges: RoadmapEdge[] = [...neededByCode.entries()]
    .filter(([, to]) => knownCodes.has(to))
    .map(([from, to]) => ({ from, to }))

  return { rows, nodes, edges }
}

/**
 * Fixed vertical geometry on the app's 4pt rhythm; the width comes from the measured container, so
 * a term's courses always split the full column between them.
 */
export const LABEL_HEIGHT = 32
export const NODE_HEIGHT = 84
export const NODE_GAP = 12 // --s3
export const ROW_GAP = 40 // room for the connectors to curve between terms
export const ROW_PITCH = LABEL_HEIGHT + NODE_HEIGHT + ROW_GAP

export function graphHeight(rowCount: number): number {
  return rowCount > 0 ? rowCount * ROW_PITCH - ROW_GAP : 0
}

export function nodeBox(node: RoadmapNodeLayout, width: number) {
  const w = (width - (node.rowSize - 1) * NODE_GAP) / node.rowSize
  return {
    x: node.col * (w + NODE_GAP),
    y: node.row * ROW_PITCH + LABEL_HEIGHT,
    w,
    h: NODE_HEIGHT,
  }
}
