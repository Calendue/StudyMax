// Max saying hello on the Overview and the desktop dashboard: the owl, one line, and a way to call
// him. Only where a call can actually happen (Max is set up and there's a plan to talk through).
import { useModel } from '../model.ts'
import { MaxOwl } from '../ui/MaxOwl.tsx'
import { Appear, Button } from '../ui/primitives.tsx'

export function MaxNudge({ index = 1 }: { index?: number }) {
  const m = useModel()
  if (!m.features.max || m.maxLive.active || m.plan.length === 0) return null
  const next = m.plan[0]?.label
  return (
    <Appear index={index} className="max-nudge">
      <MaxOwl pose="idle" size={56} />
      <div className="max-nudge__text">
        <p className="max-nudge__line">
          {next ? `Want me to walk you through ${next}?` : 'Want me to walk you through your plan?'}
        </p>
        <p className="max-nudge__sub">I&rsquo;ll call you, and change your plan as we talk.</p>
      </div>
      <Button variant="secondary" icon="phone" onClick={() => m.go('ping-max')}>
        Talk to Max
      </Button>
    </Appear>
  )
}
