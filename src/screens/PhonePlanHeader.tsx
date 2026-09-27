import { useLayoutEffect, useRef } from 'react'
import { MaxLiveBar } from '../maxLive/MaxLiveBar.tsx'
import { PlanViewSwitch } from '../skilltree/PlanViewSwitch.tsx'
import type { PlanView } from '../skilltree/planView.ts'

/** One sticky header keeps Max's proposal visible; the tree's Key pins below its actual height. */
export function PhonePlanHeader({ view, onChange, onSettings, onHeight }: {
  view: PlanView
  onChange: (view: PlanView) => void
  onSettings: () => void
  onHeight: (height: number) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const node = ref.current
    if (!node) return
    const measure = () => onHeight(Math.ceil(node.getBoundingClientRect().height))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [onHeight])
  return (
    <div className="phone-plan-header" ref={ref}>
      <PlanViewSwitch view={view} onChange={onChange} sticky onSettings={onSettings} />
      <MaxLiveBar compact />
    </div>
  )
}
