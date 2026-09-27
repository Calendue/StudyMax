// Dragging a course card up or down the Skill Tree to another term. A mouse picks it up once it moves
// a few pixels; a finger picks it up with a long press, so an ordinary swipe still scrolls the tree.
// While it's held, the card follows the pointer and the tree says which term it would land in, and
// whether it may (App.tsx checkPlacement). Letting go pins it there (placeCourse) or snaps it back
// with the reason. Only the student's own planned courses move: nothing done, under way, an open
// elective slot, or a proposal Max is showing on a call.
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import { isElective } from '../lib/plan.ts'
import type { SkillTreeLayout, TreeLane, TreeNode } from '../lib/skillTree.ts'
import { haptic } from '../platform.ts'

const MOUSE_SLOP = 6
const TOUCH_SLOP = 10
const LONG_PRESS_MS = 380

export interface CourseDrag {
  code: string
  /** How far the card has moved from where it was picked up. */
  dx: number
  dy: number
  /** The pointer, in board coordinates (for the "Move to…" tag). */
  x: number
  y: number
  /** The term under the pointer, and the band that holds it. */
  label: string | null
  bandKey: string | null
  /** Why it can't go there; null when it can (or it's over its own term, or no term). */
  problem: string | null
}

export type DropResult = { code: string; label: string; problem: string | null }

interface Pending {
  node: TreeNode
  pointerId: number
  touch: boolean
  startX: number
  startY: number
  active: boolean
  timer: ReturnType<typeof setTimeout> | null
}

export function movable(node: TreeNode): boolean {
  return (node.status === 'planned' || node.status === 'next' || node.status === 'locked') && !isElective(node.code) && !node.elective
}

/** The term a point on the board falls in: its year band, then Spring/Summer at the top or Fall/Winter by side of the trunk. */
export function termAt(layout: SkillTreeLayout, x: number, y: number): { label: string; bandKey: string } | null {
  const band = layout.bands.find((b) => b.kind === 'year' && y >= b.y && y < b.y + b.h)
  if (!band?.terms) return null
  const lane: TreeLane = band.summerTop !== undefined && y < band.y + band.summerTop ? 'summer' : x < layout.trunkX ? 'fall' : 'winter'
  const label = band.terms[lane]
  return label ? { label, bandKey: band.key } : null
}

export function useCourseDrag({
  boardRef,
  layout,
  enabled,
  check,
  place,
  onDrop,
}: {
  boardRef: RefObject<HTMLDivElement | null>
  layout: SkillTreeLayout | null
  enabled: boolean
  check: (code: string, label: string) => string | null
  place: (code: string, label: string) => string | null
  onDrop: (result: DropResult) => void
}) {
  const [drag, setDrag] = useState<CourseDrag | null>(null)
  const pending = useRef<Pending | null>(null)
  /** The click a finished drag would otherwise fire on the card (opening its details). */
  const swallowClick = useRef(false)
  /** A term's answer for the course being dragged, so crossing back and forth doesn't re-plan. */
  const answers = useRef(new Map<string, string | null>())
  const latest = useRef({ layout, check, place, onDrop })
  latest.current = { layout, check, place, onDrop }

  const stop = useCallback(() => {
    const p = pending.current
    if (p?.timer) clearTimeout(p.timer)
    pending.current = null
    answers.current.clear()
    setDrag(null)
  }, [])

  const update = useCallback((clientX: number, clientY: number) => {
    const p = pending.current
    const board = boardRef.current
    const { layout: l, check: c } = latest.current
    if (!p || !board || !l) return
    const rect = board.getBoundingClientRect()
    const x = clientX - rect.left
    const y = clientY - rect.top
    const at = termAt(l, x, y)
    let problem: string | null = null
    if (at && at.label !== p.node.term) {
      if (!answers.current.has(at.label)) answers.current.set(at.label, c(p.node.code, at.label))
      problem = answers.current.get(at.label) ?? null
    }
    setDrag({ code: p.node.code, dx: clientX - p.startX, dy: clientY - p.startY, x, y, label: at?.label ?? null, bandKey: at?.bandKey ?? null, problem })
  }, [boardRef])

  const activate = useCallback(
    (clientX: number, clientY: number) => {
      const p = pending.current
      if (!p || p.active) return
      p.active = true
      haptic.medium()
      update(clientX, clientY)
    },
    [update],
  )

  // Window-level while a card is held, so the drag keeps up with a fast pointer and ends wherever it's let go.
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const p = pending.current
      if (!p || e.pointerId !== p.pointerId) return
      const dist = Math.hypot(e.clientX - p.startX, e.clientY - p.startY)
      if (!p.active) {
        if (!p.touch && dist > MOUSE_SLOP) activate(e.clientX, e.clientY)
        // A finger that moves before the long press is scrolling, not dragging.
        else if (p.touch && dist > TOUCH_SLOP) stop()
        return
      }
      update(e.clientX, e.clientY)
    }
    const onUp = (e: PointerEvent) => {
      const p = pending.current
      if (!p || e.pointerId !== p.pointerId) return
      if (p.active) {
        swallowClick.current = true
        setTimeout(() => (swallowClick.current = false), 0)
        const { layout: l, place: put, onDrop: done } = latest.current
        const board = boardRef.current
        const rect = board?.getBoundingClientRect()
        const at = l && rect ? termAt(l, e.clientX - rect.left, e.clientY - rect.top) : null
        if (at && at.label !== p.node.term) done({ code: p.node.code, label: at.label, problem: put(p.node.code, at.label) })
      }
      stop()
    }
    const onCancel = (e: PointerEvent) => {
      if (pending.current && e.pointerId === pending.current.pointerId) stop()
    }
    // While a card is held, a finger drags it instead of scrolling the tree (needs a non-passive listener).
    const onTouchMove = (e: TouchEvent) => {
      if (pending.current?.active) e.preventDefault()
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    window.addEventListener('touchmove', onTouchMove, { passive: false })
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      window.removeEventListener('touchmove', onTouchMove)
    }
  }, [activate, boardRef, stop, update])

  // A drag in progress ends if dragging stops being allowed (Max's proposal arrives mid-drag).
  useEffect(() => {
    if (!enabled) stop()
  }, [enabled, stop])

  function onCardPointerDown(e: ReactPointerEvent<HTMLElement>, node: TreeNode) {
    if (!enabled || !movable(node) || e.button !== 0) return
    const touch = e.pointerType !== 'mouse'
    const { clientX, clientY } = e
    const p: Pending = { node, pointerId: e.pointerId, touch, startX: clientX, startY: clientY, active: false, timer: null }
    if (touch) p.timer = setTimeout(() => activate(clientX, clientY), LONG_PRESS_MS)
    pending.current = p
  }

  return {
    drag,
    onCardPointerDown,
    /** True for the click that ends a drag: the card shouldn't also open its details. */
    swallowsClick: () => swallowClick.current,
  }
}
