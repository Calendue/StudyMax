import { useMemo, useState } from 'react'
import { useModel } from '../model.ts'
import { currentTermOf, treeTargets, type TreeStatus, type TreeTargetKind } from '../lib/skillTree.ts'

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

/** The tree's inputs from the model: the leaves, the term being sat now, the beacon. */
export function useTreeInputs() {
  const { hero, targets, credentials, today, topOverlap } = useModel()
  return useMemo(() => {
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
}
