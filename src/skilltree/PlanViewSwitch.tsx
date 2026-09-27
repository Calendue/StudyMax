import { haptic } from '../platform.ts'
import type { PlanView } from './planView.ts'

const VIEWS: { id: PlanView; label: string }[] = [
  { id: 'tree', label: 'Tree' },
  { id: 'roadmap', label: 'Roadmap' },
]

/** Tree or Ayo's roadmap: two ways to read the same plan. */
export function PlanViewSwitch({ view, onChange, sticky = false }: { view: PlanView; onChange: (view: PlanView) => void; sticky?: boolean }) {
  return (
    <div className={`plan-switch${sticky ? ' plan-switch--sticky' : ''}`}>
      <div className="segmented segmented--labels" role="radiogroup" aria-label="Show the plan as">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            role="radio"
            aria-checked={view === v.id}
            className={`segmented__option${view === v.id ? ' segmented__option--on' : ''}`}
            onClick={() => {
              if (view !== v.id) haptic.selection()
              onChange(v.id)
            }}
          >
            {v.label}
          </button>
        ))}
      </div>
    </div>
  )
}
