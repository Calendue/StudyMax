// ONE MOTION VOCABULARY. Two curves: a spring for things that APPEAR (transform and opacity only,
// never sizes) and a settle for anything that changes size. Durations follow the size and meaning of
// the change, not per-component taste. Under reduced motion every change is instant; nothing is
// communicated by motion alone.
import type { Transition } from 'motion/react'

export const SPRING = [0.175, 0.885, 0.32, 1.275] as const
export const SETTLE = [0.33, 1, 0.68, 1] as const

export const DUR = {
  fast: 0.16, // presses
  med: 0.28, // sheets, chips, entrances
  slow: 0.38, // full-screen changes
} as const

export const INSTANT: Transition = { duration: 0 }

/** Staggered entrance: each row springs in a beat after the one before, capped so long lists don't wait. */
export function appearTransition(index: number, reduce: boolean | null): Transition {
  if (reduce) return INSTANT
  return { duration: DUR.med, ease: SPRING, delay: 0.05 + Math.min(index, 10) * 0.04 }
}

export function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
