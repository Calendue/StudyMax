export interface MinorOption {
  id: string
  name: string
}

export function MinorStep({
  minors,
  value,
  onChange,
}: {
  minors: MinorOption[]
  value: string | null
  onChange: (id: string | null) => void
}) {
  return (
    <div className="onboarding__step">
      <h2 className="section__title">Working on a minor?</h2>
      <p className="hint">
        Optional — StudyMax surfaces any minor you&rsquo;re close to either way, declared or not.
      </p>
      <div className="onboarding__choices">
        <button
          type="button"
          className={`onboarding__choice ${value === null ? 'onboarding__choice--selected' : ''}`}
          onClick={() => onChange(null)}
        >
          <span className="onboarding__choice-title">No minor / not sure yet</span>
        </button>
        {minors.map((minor) => (
          <button
            key={minor.id}
            type="button"
            className={`onboarding__choice ${value === minor.id ? 'onboarding__choice--selected' : ''}`}
            onClick={() => onChange(minor.id)}
          >
            <span className="onboarding__choice-title">{minor.name}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
