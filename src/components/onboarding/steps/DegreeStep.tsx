import { DEGREE_OPTIONS } from '../types.ts'

export function DegreeStep({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="onboarding__step">
      <h2 className="section__title">What degree are you working toward?</h2>
      <div className="onboarding__choices">
        {DEGREE_OPTIONS.map((degree) => (
          <button
            key={degree}
            type="button"
            className={`onboarding__choice ${value === degree ? 'onboarding__choice--selected' : ''}`}
            onClick={() => onChange(degree)}
          >
            <span className="onboarding__choice-title">{degree}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
