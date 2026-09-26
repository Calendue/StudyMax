export interface MajorOption {
  id: string
  name: string
  hasData: boolean
}

export function MajorStep({
  majors,
  value,
  onChange,
}: {
  majors: MajorOption[]
  value: string
  onChange: (id: string) => void
}) {
  return (
    <div className="onboarding__step">
      <h2 className="section__title">What&rsquo;s your major?</h2>
      <p className="hint">
        Not seeing it? Every Arts &amp; Science subject is still searchable once you&rsquo;re in — this list is just
        the ones StudyMax knows well.
      </p>
      <div className="onboarding__choices">
        {majors.map((major) => (
          <button
            key={major.id}
            type="button"
            className={`onboarding__choice ${value === major.id ? 'onboarding__choice--selected' : ''}`}
            onClick={() => onChange(major.id)}
          >
            <span className="onboarding__choice-title">{major.name}</span>
            <span className="onboarding__choice-hint">{major.hasData ? 'Full plan' : 'Scholarships only'}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
