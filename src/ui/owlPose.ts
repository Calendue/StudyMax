// Which of Max's four poses fits the moment (src/ui/MaxOwl.tsx draws it).
import type { MaxLive } from '../maxLive/useMaxLive.ts'

export type OwlPose = 'idle' | 'thinking' | 'talking' | 'celebrating'

/** Max's pose on a live call: thinking while a tool runs, celebrating a save, talking while on the line. */
export function livePose(live: Pick<MaxLive, 'working' | 'scenario' | 'callStatus'>): OwlPose {
  if (live.working) return 'thinking'
  if (live.scenario?.status === 'committed') return 'celebrating'
  if (live.callStatus === 'in_progress') return 'talking'
  return 'idle'
}
