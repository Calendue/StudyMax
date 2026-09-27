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

const MOVE_MS = 800
const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)'
const GHOST_MS = 1600
/** The camera moves first (onChanged), then the change plays where you can see it. */
const LEAD_MS = 380
/** How long a card Max added or moved keeps its "Added by Max" / "Moved by Max" tag. */
const TAG_MS = 3000

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
  const tagTimers = useRef<ReturnType<typeof setTimeout>[]>([])
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

    // Tags what Max just did on the card itself ("+ Added by Max"), outside React so no re-render
    // clears it; the next change or the end of the call takes the old ones off.
    // Back to the app's own plan: everything glides home, with no tags or ghosts to say "Max did this".
    const back = liveKey === null
    const tag = (c: HTMLElement | null, kind: 'added' | 'moved') => {
      if (!c || back) return
      c.dataset.maxFx = kind
      // A newer tag on the same card restarts its clock.
      const at = String(Date.now())
      c.dataset.maxFxAt = at
      tagTimers.current.push(setTimeout(() => c.dataset.maxFxAt === at && delete c.dataset.maxFx, TAG_MS))
    }
    const nodeY = (code: string) => {
      const n = layout.nodes.find((x) => x.code === code)
      return n ? n.y + n.h / 2 : null
    }
    // The courses that really changed lead the camera; a course only nudged over by them doesn't.
    const lead = d.moved.filter((m) => m.fromTerm !== m.toTerm)
    for (const code of [...d.sprouted, ...lead.map((m) => m.code)]) {
      const y = nodeY(code)
      if (y !== null) changedY.push(y)
    }
    for (const node of d.pruned) changedY.push(ghostTop(node, last.layout, layout) + node.h / 2)
    if (changedY.length > 0) changed.current?.(changedY.reduce((a, b) => a + b, 0) / changedY.length)

    if (reduce) {
      // No motion: the end state at once, a steady outline and the tags say what changed.
      for (const code of [...d.sprouted, ...lead.map((m) => m.code), ...d.restatus]) {
        card(code)?.animate([{ outline: `2px solid ${accent}` }, { outline: `2px solid ${accent}` }], { duration: 2500 })
      }
      d.sprouted.forEach((code) => tag(card(code), 'added'))
      lead.forEach((m) => tag(card(m.code), 'moved'))
      if (d.pruned.length > 0 && !back) setGhosts(d.pruned.map((node) => ({ node, top: ghostTop(node, last.layout, layout) })))
      return
    }

    const trunkX = layout.width / 2
    d.moved.forEach((m, i) => {
      const c = card(m.code)
      if (!c) return
      const real = m.fromTerm !== m.toTerm
      // A real move arcs out sideways (away from the trunk) and lifts as it travels between terms.
      const n = layout.nodes.find((x) => x.code === m.code)
      const side = n && n.x + n.w / 2 < trunkX ? -1 : 1
      const bow = real ? side * Math.min(60, 18 + Math.abs(m.dy) * 0.25) : 0
      const hi = real ? `0 0 0 3px ${ring}, 0 10px 24px ${glow}` : `0 0 0 2px ${ring}`
      c.animate(
        [
          { transform: `translate(${m.dx}px, ${m.dy}px) scale(1)`, boxShadow: hi, zIndex: 3 },
          { transform: `translate(${m.dx / 2 + bow}px, ${m.dy / 2}px) scale(${real ? 1.08 : 1})`, boxShadow: hi, zIndex: 3, offset: 0.45 },
          { transform: 'translate(0, 0) scale(1)', boxShadow: hi, zIndex: 3, offset: 0.85 },
          { transform: 'translate(0, 0) scale(1)', boxShadow: '0 0 0 0 transparent', zIndex: 3 },
        ],
        { duration: (real ? MOVE_MS : 500) + 400, easing: EASE, delay: LEAD_MS + Math.min(i, 12) * 25, fill: 'backwards' },
      )
      if (real) tag(c, 'moved')
    })

    d.sprouted.forEach((code, i) => {
      const c = card(code)
      if (!c) return
      // Grows out of the trunk along its twig: from the trunk's side, small, into place with a rose pulse.
      const n = layout.nodes.find((x) => x.code === code)
      const fromTrunk = n ? (trunkX - (n.x + n.w / 2)) * 0.7 : 0
      c.animate(
        [
          { transform: `translate(${fromTrunk}px, 16px) scale(0.2)`, opacity: 0, boxShadow: `0 0 0 0 ${ring}` },
          { transform: 'translate(0, 0) scale(1.1)', opacity: 1, boxShadow: `0 0 0 10px ${glow}`, offset: 0.55 },
          { transform: 'translate(0, 0) scale(1)', opacity: 1, boxShadow: `0 0 0 4px ${ring}`, offset: 0.8 },
          { transform: 'translate(0, 0) scale(1)', opacity: 1, boxShadow: '0 0 0 0 transparent' },
        ],
        { duration: 1100, easing: EASE, delay: LEAD_MS + Math.min(i, 12) * 60, fill: 'backwards' },
      )
      tag(c, 'added')
    })

    d.restatus.forEach((code) => {
      card(code)?.animate([{ boxShadow: `0 0 0 3px ${ring}` }, { boxShadow: '0 0 0 0 transparent' }], { duration: 1400, easing: EASE })
    })

    // The wood redraws in one go; a short dip hides the swap of every twig and the trunk.
    el.querySelector<SVGElement>('.tree__svg')?.animate([{ opacity: 0.25 }, { opacity: 1 }], { duration: 600, delay: LEAD_MS, easing: EASE, fill: 'backwards' })

    // Pruned cards linger where they were, struck through, then shrink back into the trunk.
    if (d.pruned.length > 0 && !back) setGhosts(d.pruned.map((node) => ({ node, top: ghostTop(node, last.layout, layout) })))
  }, [board, layout, liveKey, reduce])

  // Back to the app's own plan (the call ended or the change was left): no tag outlives it.
  useLayoutEffect(() => {
    if (liveKey !== null) return
    tagTimers.current.forEach(clearTimeout)
    tagTimers.current = []
    board.current?.querySelectorAll<HTMLElement>('[data-max-fx]').forEach((c) => delete c.dataset.maxFx)
  }, [board, liveKey])
  useLayoutEffect(() => () => tagTimers.current.forEach(clearTimeout), [])

  // Ghosts fade out (CSS), then go.
  useLayoutEffect(() => {
    if (ghosts.length === 0) return
    const t = setTimeout(() => setGhosts([]), GHOST_MS)
    return () => clearTimeout(t)
  }, [ghosts])

  return ghosts
}
