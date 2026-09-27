import { useModel } from '../model.ts'
import { Button } from '../ui/primitives.tsx'
import { Sheet } from '../ui/Sheet.tsx'
import { PlanControls } from './PlanControls.tsx'

/** The same controls as desktop, one tap from the phone's pinned Tree / Roadmap bar. */
export function PlanSettingsSheet() {
  const m = useModel()
  return (
    <Sheet open={m.sheet === 'plan-settings'} onClose={() => m.setSheet(null)} title="Plan settings"
      footer={<Button block onClick={() => m.setSheet(null)}>Done</Button>}>
      <p className="lead">Your plan updates as you choose.</p>
      <PlanControls />
    </Sheet>
  )
}
