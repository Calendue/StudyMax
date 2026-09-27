import type { Degree, DegreeBlock } from '../data/degrees/types.ts'
import { auditDegree } from './degree.ts'
import type { PlannedTerm } from './plan.ts'
import type { TreeDegreeProgress } from './skillTree.ts'

// The degree's progress as the skill tree shows it: credit units done, under way and planned against
// the 120, each C block done or left, the milestones on the trunk, and what each course counts toward.
// Three audits of the same degree (done; done and under way; everything planned too), so a course
// never counts twice and the numbers always agree with the planner's own audit.

const BLOCK_LABEL: Record<DegreeBlock, string> = {
  C1: 'College',
  C2: 'Breadth',
  C3: 'Cognate',
  C4: 'Major',
  C5: 'Electives',
}
const BLOCKS: DegreeBlock[] = ['C1', 'C2', 'C3', 'C4', 'C5']

export function treeDegreeProgress(
  degree: Degree,
  completed: Iterable<string>,
  inProgress: Iterable<string>,
  plan: PlannedTerm[],
): TreeDegreeProgress {
  const done = [...completed]
  const now = [...done, ...inProgress]
  const all = [...now, ...plan.flatMap((t) => t.courses.map((c) => c.code))]
  const [a, b, c] = [auditDegree(degree, done), auditDegree(degree, now), auditDegree(degree, all)]

  const inBlock = (audit: typeof a, block: DegreeBlock) =>
    audit.groups.filter((g) => g.group.block === block).reduce((n, g) => n + g.cu, 0)
  const grouped = (audit: typeof a) => BLOCKS.slice(0, 4).reduce((n, block) => n + inBlock(audit, block), 0)
  const needOf = (block: DegreeBlock) => degree.groups.filter((g) => g.block === block).reduce((n, g) => n + g.needCu, 0)
  const c5Need = Math.max(0, degree.totalCu - BLOCKS.slice(0, 4).reduce((n, block) => n + needOf(block), 0))
  const c5 = (audit: typeof a) => Math.min(c5Need, Math.max(0, audit.countedCu - grouped(audit)))

  const blocks = BLOCKS.map((block) => {
    const needCu = block === 'C5' ? c5Need : needOf(block)
    const nowCu = block === 'C5' ? c5(b) : inBlock(b, block)
    const allCu = block === 'C5' ? c5(c) : inBlock(c, block)
    return { id: block, label: BLOCK_LABEL[block], needCu, doneCu: nowCu, plannedCu: Math.max(0, allCu - nowCu) }
  }).filter((x) => x.needCu > 0)

  const groupLabel = new Map(degree.groups.map((g) => [g.id, `${g.block} ${BLOCK_LABEL[g.block]}: ${g.label}`]))
  const countsToward = Object.fromEntries(
    Object.entries(c.assignment).map(([code, id]) => [code, id ? (groupLabel.get(id) ?? id) : 'C5 Electives']),
  )

  return {
    name: degree.name,
    doneCu: a.countedCu,
    inProgressCu: Math.max(0, b.countedCu - a.countedCu),
    plannedCu: Math.max(0, c.countedCu - b.countedCu),
    totalCu: degree.totalCu,
    blocks,
    milestones: (degree.milestones ?? []).map(({ id, label, afterCu, detail }) => ({ id, label, afterCu, detail })),
    countsToward,
  }
}
