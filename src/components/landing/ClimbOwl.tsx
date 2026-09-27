import { useEffect, useRef, useState, type RefObject } from 'react'
import { motion, useMotionValueEvent, type MotionValue } from 'motion/react'
import { MaxOwl } from '../../ui/MaxOwl.tsx'
import type { OwlPose } from '../../ui/owlPose.ts'
import type { ClimbGeometry, Perch } from './geometry.ts'

// Max climbs with you: he sits on the sprig nearest the middle of the screen and, when you scroll to
// another, flies over to it in a short arc, wings out. At the top of the trunk he stays celebrating.
// He only lands on wood that has grown, and he's decorative (the copy says everything he'd say).

/** Where on screen he tries to stay, as a fraction of its height: a little below the middle. */
const EYE = 0.6

function nearest(perches: Perch[], grown: number, y: number): number {
  let best = -1
  perches.forEach((p, i) => {
    if (p.beat > grown) return
    if (best < 0 || Math.abs(p.y - y) < Math.abs(perches[best].y - y)) best = i
  })
  return best
}

interface ClimbOwlProps {
  g: ClimbGeometry
  grown: number
  stageRef: RefObject<HTMLDivElement | null>
  scrollerRef: RefObject<HTMLElement | null>
  scrollY: MotionValue<number>
  reduce: boolean
}

export function ClimbOwl({ g, grown, stageRef, scrollerRef, scrollY, reduce }: ClimbOwlProps) {
  const size = g.compact ? 52 : 86
  const [at, setAt] = useState(-1)
  // The perch he's flying from, while he's in the air.
  const [from, setFrom] = useState<Perch | null>(null)
  const atRef = useRef(-1)
  // The stage's top in the scroller's content, measured with the geometry, so a scroll reads no layout.
  const stageTop = useRef(0)
  const view = useRef(0)

  const pick = () => {
    const scroller = scrollerRef.current
    if (!scroller) return
    const y = scroller.scrollTop + view.current * EYE - stageTop.current
    const next = nearest(g.perches, grown, y)
    const prev = atRef.current
    if (next === prev) return
    atRef.current = next
    setAt(next)
    setFrom(prev >= 0 && !reduce ? g.perches[prev] ?? null : null)
  }
  useMotionValueEvent(scrollY, 'change', pick)
  // A new geometry (a resize) or more wood grown can change which perch is nearest.
  useEffect(() => {
    const stage = stageRef.current
    const scroller = scrollerRef.current
    if (!stage || !scroller) return
    const measure = () => {
      const top = scroller === document.scrollingElement ? 0 : scroller.getBoundingClientRect().top
      stageTop.current = stage.getBoundingClientRect().top - top + scroller.scrollTop
      view.current = scroller.clientHeight
    }
    measure()
    pick()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [g, grown]) // eslint-disable-line react-hooks/exhaustive-deps

  const perch = g.perches[at]
  const distance = from && perch ? Math.hypot(from.x - perch.x, from.y - perch.y) : 0
  // Quick hops between neighbours; a fast scroll still sends him on a big, high super jump.
  const duration = Math.min(0.5, 0.18 + distance / 3600)
  useEffect(() => {
    if (!from) return
    const landed = setTimeout(() => setFrom(null), duration * 1000 + 50)
    return () => clearTimeout(landed)
  }, [from, duration])

  if (!perch) return null
  // Feet on the twig, and never past the stage's edge (on a phone the trunk hugs the right side).
  const x = Math.max(4, Math.min(g.width - size - 4, perch.x - size / 2))
  const y = perch.y - size * 0.94
  const lift = Math.min(90, 24 + distance * 0.2)
  const atTop = at === g.perches.length - 1
  const pose: OwlPose = from || atTop ? 'celebrating' : 'idle'

  return (
    <motion.div
      className="climb__owl"
      initial={false}
      // In the air: an arc up over the gap and down onto the twig, starting from wherever he is now
      // (null), so a new perch mid-flight turns him around without a snap. Landed: just where he sits.
      animate={from ? { x, y: [null, Math.min(from.y, perch.y) - size * 0.94 - lift, y] } : { x, y }}
      transition={from ? { x: { duration, ease: 'easeOut' }, y: { duration, ease: 'easeInOut', times: [0, 0.5, 1] } } : { duration: 0 }}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <MaxOwl pose={pose} size={size} className={from ? 'climb__owl-flap' : undefined} />
    </motion.div>
  )
}
