import type { StudentType } from '../types.ts'

export function StudentTypeStep({
  value,
  onChange,
}: {
  value: StudentType | null
  onChange: (value: StudentType) => void
}) {
  return (
    <div className="onboarding__step">
      <h2 className="section__title">Are you just starting out?</h2>
      <p className="hint">This changes whether we ask for a transcript next.</p>
      <div className="onboarding__choices">
        <button
          type="button"
          className={`onboarding__choice ${value === 'first-year' ? 'onboarding__choice--selected' : ''}`}
          onClick={() => onChange('first-year')}
        >
          <span className="onboarding__choice-title">First-year student</span>
          <span className="onboarding__choice-hint">No courses yet — we&rsquo;ll build your path from scratch.</span>
        </button>
        <button
          type="button"
          className={`onboarding__choice ${value === 'existing' ? 'onboarding__choice--selected' : ''}`}
          onClick={() => onChange('existing')}
        >
          <span className="onboarding__choice-title">Existing student</span>
          <span className="onboarding__choice-hint">
            You&rsquo;ve got courses on the books — upload a transcript or add them by hand.
          </span>
        </button>
      </div>
    </div>
  )
}
