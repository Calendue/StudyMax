import { CourseCheck } from '../../CourseCheck.tsx'

export interface ConcentrationOption {
  id: string
  name: string
}

export function ConcentrationStep({
  options,
  selected,
  onToggle,
}: {
  options: ConcentrationOption[]
  selected: string[]
  onToggle: (id: string) => void
}) {
  return (
    <div className="onboarding__step">
      <h2 className="section__title">Any specializations you&rsquo;re targeting?</h2>
      <p className="hint">Optional — pick as many as you&rsquo;re considering. You can change this anytime.</p>
      <ul className="checklist">
        {options.map((option) => (
          <CourseCheck
            key={option.id}
            label={option.name}
            checked={selected.includes(option.id)}
            onToggle={() => onToggle(option.id)}
          />
        ))}
      </ul>
    </div>
  )
}
