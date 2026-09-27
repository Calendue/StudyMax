import { useMemo, useState } from 'react'
import { useModel } from '../model.ts'
import { termLabel } from '../lib/currentTerms.ts'
import { currentTermOf, treeTargets, type TreeNode, type TreeStatus, type TreeTargetKind } from '../lib/skillTree.ts'

export type PlanView = 'tree' | 'roadmap'

const VIEW_KEY = 'studymax.planView'

function readView(): PlanView {
  try {
    return localStorage.getItem(VIEW_KEY) === 'roadmap' ? 'roadmap' : 'tree'
  } catch {
    return 'tree'
  }
}

/** Tree or Ayo's roadmap, remembered on this device. The phone tab and the desktop page share it. */
export function usePlanView(): [PlanView, (view: PlanView) => void] {
  const [view, setView] = useState<PlanView>(readView)
  return [
    view,
    (next) => {
      setView(next)
      try {
        localStorage.setItem(VIEW_KEY, next)
      } catch {
        // Private mode or blocked storage: the choice just lasts this visit.
      }
    },
  ]
}

/** What's selected on the tree: a course card, or a leaf in the canopy. */
export type TreeSelection = { kind: 'node'; code: string } | { kind: 'leaf'; index: number }

export const STATUS_LABEL: Record<TreeStatus, string> = {
  completed: 'Done',
  inProgress: 'Taking now',
  next: 'Take next',
  planned: 'Planned',
  locked: 'Locked',
}

/** A card's status in words: a course registered for a later term is Registered, not Taking now. */
export function statusLabel(node: TreeNode): string {
  return node.status === 'inProgress' && !node.current ? 'Registered' : STATUS_LABEL[node.status]
}

/** The tree's inputs from the model: the leaves, the terms and loads, the beacon. */
export function useTreeInputs() {
  const model = useModel()
  const { hero, targets, credentials, today, topOverlap, currentByTerm, coursesPerTerm, summerPerTerm, completedTerms, treeDegree } = model
  const terms = useMemo(
    () => ({
      // Each in-progress or registered course in its own term, as the Courses page groups them.
      inProgressTerms: Object.fromEntries(currentByTerm.flatMap((g) => g.courses.map((c) => [c, termLabel(g.season, today)]))),
      completedTerms: completedTerms ?? {},
      termLoad: coursesPerTerm,
      summerLoad: summerPerTerm,
      degree: treeDegree,
    }),
    [currentByTerm, today, completedTerms, coursesPerTerm, summerPerTerm, treeDegree],
  )
  const leaves = useMemo(() => {
    const kindOf = (id: string): TreeTargetKind => {
      const kind = credentials.find((c) => c.spec.id === id)?.program.kind
      return kind === 'certificate' || kind === 'minor' ? kind : 'specialization'
    }
    const planned = [hero, ...targets.filter((t) => t.spec.id !== hero.spec.id)]
      .filter((t) => t.totalRequired > 0)
      .map((match) => ({ match, kind: kindOf(match.spec.id) }))
    const partway = credentials.map((match) => ({ match, kind: kindOf(match.spec.id) }))
    return {
      targets: treeTargets(planned, partway),
      currentTerm: currentTermOf(today),
      bestNext: topOverlap?.course ?? null,
    }
  }, [hero, targets, credentials, today, topOverlap])
  return useMemo(() => ({ ...leaves, ...terms }), [leaves, terms])
}
