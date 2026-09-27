// The stage trigger for the rehearsal call (demo.ts): press D five times on the Plan (dev builds, or
// after opening the app with ?maxdemo), or open it with ?maxdemo=1 to play once when the tree shows.
import { useEffect, useRef } from 'react'
import { useModel } from '../model.ts'
import { demoEvents, demoFrames, maxDemoAutoplay, maxDemoEnabled } from './demo.ts'

const PRESSES = 5
const WITHIN_MS = 2000

export function useMaxDemo() {
  const m = useModel()
  const latest = useRef(m)
  latest.current = m

  useEffect(() => {
    if (!maxDemoEnabled()) return
    const play = () => {
      const { plan, maxPlanInputs: base, planCompleted, maxLive } = latest.current
      // Never over a real call.
    if (!base || (maxLive.active && !maxLive.demo)) return
      const frames = demoFrames(plan, { ...base, droppedCourses: [] }, new Set(planCompleted))
      if (frames) maxLive.runDemo(demoEvents(frames, null))
    }
    let presses: number[] = []
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'd' || e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target as HTMLElement | null
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return
      const now = Date.now()
      presses = [...presses.filter((p) => now - p < WITHIN_MS), now]
      if (presses.length >= PRESSES) {
        presses = []
        play()
      }
    }
    window.addEventListener('keydown', onKey)
    const auto = maxDemoAutoplay() ? setTimeout(play, 1500) : null
    return () => {
      window.removeEventListener('keydown', onKey)
      if (auto) clearTimeout(auto)
    }
  }, [])
}
