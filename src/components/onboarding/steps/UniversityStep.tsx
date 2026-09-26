// Only USask has requirement data right now (see CLAUDE.md / README "Scope: Computer Science").
// The rest are shown, disabled, so the onboarding flow reads as a product built to scale to many
// schools rather than one hardcoded to a single university.
const COMING_SOON = ['University of Regina', 'University of Toronto', 'University of Waterloo']

export function UniversityStep({ chosen, onChoose }: { chosen: boolean; onChoose: () => void }) {
  return (
    <div className="onboarding__step">
      <h2 className="section__title">Where do you study?</h2>
      <p className="hint">StudyMax only has full requirement data for one school so far.</p>
      <div className="onboarding__choices">
        <button
          type="button"
          className={`onboarding__choice ${chosen ? 'onboarding__choice--selected' : ''}`}
          onClick={onChoose}
        >
          <span className="onboarding__choice-title">University of Saskatchewan</span>
          <span className="onboarding__choice-hint">Full plan, credentials and scholarships.</span>
        </button>
        {COMING_SOON.map((name) => (
          <div key={name} className="onboarding__choice onboarding__choice--disabled" aria-disabled="true">
            <span className="onboarding__choice-title">{name}</span>
            <span className="onboarding__choice-hint">Coming soon</span>
          </div>
        ))}
      </div>
    </div>
  )
}
