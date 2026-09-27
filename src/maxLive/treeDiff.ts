// What changed between two Skill Tree layouts, course by course — the input to the live animation.
// Pure (no React), so the check scripts can hold it to account.
//
// Positions compare from the BOTTOM of the board: the tree keeps its roots pinned in view, so when
// graduation moves the canopy grows or shrinks at the top and a course that didn't move keeps its
// distance from the bottom, even though its `y` (from the top) changed.
import { isElective } from '../lib/plan.ts'
import type { SkillTreeLayout, TreeNode } from '../lib/skillTree.ts'

export interface TreeMove {
  code: string
  /** Old screen position minus new, bottom-anchored: translate by this to start where it was. */
  dx: number
  dy: number
  fromTerm: string
  toTerm: string
}

export interface TreeDiff {
  /** On the new tree only. */
  sprouted: string[]
  /** On the old tree only, with where they were (drawn as fading ghosts). */
  pruned: TreeNode[]
  /** On both, somewhere else. */
  moved: TreeMove[]
  /** On both, in place, but its status changed (Taking now → Planned). */
  restatus: string[]
}

const MOVED_PX = 2

export function diffLayouts(prev: SkillTreeLayout, next: SkillTreeLayout): TreeDiff {
  const before = new Map(prev.nodes.map((n) => [n.code, n]))
  const after = new Map(next.nodes.map((n) => [n.code, n]))
  const sprouted: string[] = []
  const moved: TreeMove[] = []
  const restatus: string[] = []

  for (const n of next.nodes) {
    const was = before.get(n.code)
    if (!was) {
      // An open slot's placeholder is numbered by position: a new number isn't a new course.
      if (!isElective(n.code)) sprouted.push(n.code)
      continue
    }
    const dx = was.x - n.x
    const dy = next.height - n.y - (prev.height - was.y)
    if (Math.abs(dx) > MOVED_PX || Math.abs(dy) > MOVED_PX) moved.push({ code: n.code, dx, dy, fromTerm: was.term, toTerm: n.term })
    else if (was.status !== n.status) restatus.push(n.code)
  }
  const pruned = prev.nodes.filter((n) => !after.has(n.code) && !isElective(n.code))
  return { sprouted, pruned, moved, restatus }
}

/** Where a pruned card sits on the new board: same distance from the bottom as before. */
export function ghostTop(node: TreeNode, prev: SkillTreeLayout, next: SkillTreeLayout): number {
  return next.height - (prev.height - node.y)
}
