// Animates the Skill Tree from one plan to the next while Max reshapes it on a call: cards glide to
// their new terms (FLIP), new ones sprout, pruned ones fade out as ghosts, and the wood cross-fades.
// Only runs when `liveKey` changes — a new frame from Max — never on a resize or the app's own edits.
//
// Moves use the Web Animations API rather than motion's `layout`: the cards already carry CSS
// transforms (the press scale, the first-grow entrance) that motion's inline transforms would fight,
// and an element animation overrides only while it runs, with no extra React renders.
import { useLayoutEffect, useRef, useState } from 'react'
import type { SkillTreeLayout, TreeNode } from '../lib/skillTree.ts'
import { diffLayouts, ghostTop } from '../maxLive/treeDiff.ts'

const MOVE_MS = 650
const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)'
const GHOST_MS = 800

export interface TreeGhost {
  node: TreeNode
  top: number
}

export function useTreeTransition(
  board: React.RefObject<HTMLDivElement | null>,
  layout: SkillTreeLayout | null,
  liveKey: string | null,
  reduce: boolean,
  onChanged?: (centreY: number) => void,
): TreeGhost[] {
  const prev = useRef<{ layout: SkillTreeLayout; key: string | null } | null>(null)
  const [ghosts, setGhosts] = useState<TreeGhost[]>([])
  // Read at the moment of a change, so a new callback each render never re-runs the animation.
  const changed = useRef(onChanged)
  useLayoutEffect(() => {
    changed.current = onChanged
  })

  useLayoutEffect(() => {
    const last = prev.current
    prev.current = layout ? { layout, key: liveKey } : null
    const el = board.current
    if (!layout || !last || !el || last.key === liveKey) return
    // Width changed too (a resize mid-call): just draw the new tree.
    if (Math.abs(last.layout.width - layout.width) > 1) return
    const d = diffLayouts(last.layout, layout)
    const card = (code: string) => el.querySelector<HTMLElement>(`[data-key="${CSS.escape(code)}"]`)
    const changedY: number[] = []
    // The design tokens, resolved: keyframes take plain colours, not var() references, everywhere.
    const style = getComputedStyle(el)
    const token = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback
    const ring = token('--accent-edge', 'rgb(152 38 73 / 0.24)')
    const glow = token('--accent-tint', 'rgb(152 38 73 / 0.1)')
    const accent = token('--accent', '#982649')

    if (reduce) {
      // No motion: a brief outline on everything that changed, the words are in the live caption.
      for (const code of [...d.sprouted, ...d.moved.map((m) => m.code), ...d.restatus]) {
        card(code)?.animate([{ outline: `2px solid ${accent}` }, { outline: `2px solid ${accent}` }], { duration: 2500 })
      }
      return
    }

    d.moved.forEach((m, i) => {
      const c = card(m.code)
      if (!c) return
      c.animate(
        [
          { transform: `translate(${m.dx}px, ${m.dy}px)`, boxShadow: `0 0 0 3px ${ring}` },
          { transform: 'translate(0, 0)', boxShadow: `0 0 0 3px ${ring}`, offset: 0.85 },
          { transform: 'translate(0, 0)', boxShadow: '0 0 0 0 transparent' },
        ],
        { duration: MOVE_MS + 500, easing: EASE, delay: Math.min(i, 12) * 25, fill: 'backwards' },
      )
      const n = layout.nodes.find((x) => x.code === m.code)
      if (n) changedY.push(n.y + n.h / 2)
    })

    d.sprouted.forEach((code, i) => {
      const c = card(code)
      if (!c) return
      c.animate(
        [
          { transform: 'scale(0.6)', opacity: 0, boxShadow: `0 0 0 0 ${ring}` },
          { transform: 'scale(1.06)', opacity: 1, boxShadow: `0 0 0 8px ${glow}`, offset: 0.6 },
          { transform: 'scale(1)', opacity: 1, boxShadow: '0 0 0 0 transparent' },
        ],
        { duration: 900, easing: EASE, delay: 200 + Math.min(i, 12) * 40, fill: 'backwards' },
      )
      const n = layout.nodes.find((x) => x.code === code)
      if (n) changedY.push(n.y + n.h / 2)
    })

    d.restatus.forEach((code) => {
      card(code)?.animate([{ boxShadow: `0 0 0 3px ${ring}` }, { boxShadow: '0 0 0 0 transparent' }], { duration: 1400, easing: EASE })
    })

    // The wood redraws in one go; a short dip hides the swap of every twig and the trunk.
    el.querySelector<SVGElement>('.tree__svg')?.animate([{ opacity: 0.25 }, { opacity: 1 }], { duration: 500, easing: EASE })

    // Pruned cards linger where they were, then fade: you see what Max took out.
    if (d.pruned.length > 0) {
      setGhosts(d.pruned.map((node) => ({ node, top: ghostTop(node, last.layout, layout) })))
      for (const node of d.pruned) changedY.push(ghostTop(node, last.layout, layout) + node.h / 2)
    }

    if (changedY.length > 0) changed.current?.(changedY.reduce((a, b) => a + b, 0) / changedY.length)
  }, [board, layout, liveKey, reduce])

  // Ghosts fade out (CSS), then go.
  useLayoutEffect(() => {
    if (ghosts.length === 0) return
    const t = setTimeout(() => setGhosts([]), GHOST_MS)
    return () => clearTimeout(t)
  }, [ghosts])

  return ghosts
}
