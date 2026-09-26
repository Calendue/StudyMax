import type { PlannedTerm } from './plan.ts'

export type RoadmapNodeState = 'done' | 'in-progress' | 'requirement' | 'prerequisite'

export interface RoadmapNodeLayout {
  code: string
  state: RoadmapNodeState
  neededBy?: string
  prerequisiteText?: string
  alsoAdvances: string[]
  col: number
  row: number
}

export interface RoadmapColumn {
  key: string
  label: string
  collapsible: boolean
  codes: string[]
}

export interface RoadmapEdge {
  from: string
  to: string
}

export interface RoadmapLayout {
  columns: RoadmapColumn[]
  nodes: RoadmapNodeLayout[]
  edges: RoadmapEdge[]
}

/**
 * Turns the plan's term buckets into fixed grid coordinates: a leading "Completed" column for done
 * courses relevant to the credential, an "In progress" column for the ones the student is sitting
 * in now (the plan counts them as passed by its first term, so they'd otherwise vanish), then one
 * column per term, rows in the order the plan already computed. Pure and React-free — `buildPlan`
 * already did the hard part (topological order, term batching); this only assigns (col, row)
 * positions to what it produced.
 */
export function buildRoadmapLayout(
  terms: PlannedTerm[],
  completedRelevant: string[],
  inProgressRelevant: string[] = [],
): RoadmapLayout {
  const columns: RoadmapColumn[] = []
  const nodes: RoadmapNodeLayout[] = []
  const neededByCode = new Map<string, string>()

  let col = 0
  if (completedRelevant.length > 0) {
    const codes = [...completedRelevant].sort()
    columns.push({ key: 'completed', label: 'Completed', collapsible: true, codes })
    codes.forEach((code, row) => nodes.push({ code, state: 'done', alsoAdvances: [], col, row }))
    col++
  }

  if (inProgressRelevant.length > 0) {
    const codes = [...inProgressRelevant].sort()
    columns.push({ key: 'in-progress', label: 'In progress', collapsible: false, codes })
    codes.forEach((code, row) => nodes.push({ code, state: 'in-progress', alsoAdvances: [], col, row }))
    col++
  }

  for (const term of terms) {
    const codes = term.courses.map((c) => c.code)
    columns.push({ key: term.label, label: term.label, collapsible: false, codes })
    term.courses.forEach((c, row) => {
      nodes.push({
        code: c.code,
        state: c.reason === 'prerequisite' ? 'prerequisite' : 'requirement',
        neededBy: c.neededBy,
        prerequisiteText: c.prerequisiteText,
        alsoAdvances: c.alsoAdvances,
        col,
        row,
      })
      if (c.neededBy) neededByCode.set(c.code, c.neededBy)
    })
    col++
  }

  // `neededBy` always points at a course still being planned (a satisfied prerequisite is never
  // queued), so both ends of every edge are guaranteed to be in `nodes` — the filter is just a
  // defensive guard against a future data shape change, not something expected to trigger today.
  const knownCodes = new Set(nodes.map((n) => n.code))
  const edges: RoadmapEdge[] = [...neededByCode.entries()]
    .filter(([, to]) => knownCodes.has(to))
    .map(([from, to]) => ({ from, to }))

  return { columns, nodes, edges }
}

/**
 * Fixed pixel geometry for the column layout and edge overlay, on the app's 4pt rhythm (tokens.css
 * --s2/--s3/--s5) so edges never need a ResizeObserver/layout pass to stay aligned.
 */
export const COLUMN_WIDTH = 192
export const COLUMN_GAP = 24 // --s5
export const HEADER_HEIGHT = 32
export const NODE_HEIGHT = 56
export const NODE_GAP = 8 // --s2

export function columnX(col: number): number {
  return col * (COLUMN_WIDTH + COLUMN_GAP)
}

export function nodeCenterY(row: number): number {
  return HEADER_HEIGHT + row * (NODE_HEIGHT + NODE_GAP) + NODE_HEIGHT / 2
}
