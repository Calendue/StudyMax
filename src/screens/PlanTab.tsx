import { useModel } from '../model.ts'
import { KIND_LABEL, plural } from '../format.ts'
import { ScreenTitle } from '../ui/chrome.tsx'
import { Icon } from '../ui/Icon.tsx'
import { Appear, Button, Group, Ring, Row, SectionLabel } from '../ui/primitives.tsx'
import { Sheet } from '../ui/Sheet.tsx'
import { PlanRoadmap } from './PlanRoadmap.tsx'

export function PlanTab() {
  const m = useModel()
  const plan = m.plan
  const last = plan[plan.length - 1]

  if (plan.length === 0) {
    // Targets with courses left but no plan: everything left is being taken right now.
    const lead =
      m.targets.length > 0
        ? `Everything left for ${m.hero.spec.name} is in progress now. Finish those and it's done. Pick another target on the Closest tab to plan it too.`
        : `You've finished ${m.hero.spec.name}. Pick another target on the Closest tab to plan it.`
    return (
      <>
        <ScreenTitle lead={lead}>
          Your plan
        </ScreenTitle>
        <Button block variant="secondary" onClick={() => m.setTab('overview')}>
          See what you&rsquo;re close to
        </Button>
      </>
    )
  }

  return (
    <>
      <ScreenTitle
        lead={
          <>
            {plural(plan.length, 'term')} to finish, by <strong>{last.label}</strong>. Where a requirement gave you a
            choice, we picked the course that also counts toward the most other credentials.
          </>
        }
      >
        Your plan
      </ScreenTitle>

      <Appear index={0} className="targets">
        {m.targets.map((t) => (
          <span key={t.spec.id} className="chip chip--target">
            {t.spec.name}
            {t.spec.id !== m.hero.spec.id && (
              <button
                type="button"
                className="chip__remove"
                aria-label={`Remove ${t.spec.name} from this plan`}
                onClick={() => m.setExtraTargetIds((ids) => ids.filter((id) => id !== t.spec.id))}
              >
                <Icon name="close" size={14} />
              </button>
            )}
          </span>
        ))}
        {m.addableTargets.length > 0 && (
          <button type="button" className="chip chip--add" onClick={() => m.openSheet('addTarget')}>
            <Icon name="plus" size={14} />
            Plan another alongside
          </button>
        )}
      </Appear>

      <Appear index={1} className="per-term">
        <span id="per-term-label">Courses per term</span>
        <div className="segmented" role="radiogroup" aria-labelledby="per-term-label">
          {[1, 2, 3, 4].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={m.coursesPerTerm === n}
              className={`segmented__option${m.coursesPerTerm === n ? ' segmented__option--on' : ''}`}
              onClick={() => m.setCoursesPerTerm(n)}
            >
              {n}
            </button>
          ))}
        </div>
      </Appear>

      <Appear index={1} className="per-term">
        <label htmlFor="start-term">Starting</label>
        {/* ponytail: native select, not a segmented control; six term labels don't fit one row on a phone */}
        <select
          id="start-term"
          value={`${m.startTerm.season} ${m.startTerm.year}`}
          onChange={(e) => {
            const t = m.startChoices.find((c) => `${c.season} ${c.year}` === e.target.value)
            if (t) m.setStartTerm(t)
          }}
        >
          {m.startChoices.map((t) => (
            <option key={`${t.season} ${t.year}`}>{`${t.season} ${t.year}`}</option>
          ))}
        </select>
      </Appear>

      {m.hiddenPrereqs.length > 0 && (
        <Appear index={2} className="notice">
          <p>
            <strong>
              {plural(m.hiddenPrereqs.length, 'course')} below {m.hiddenPrereqs.length === 1 ? "isn't" : "aren't"} on the
              specialization page.
            </strong>{' '}
            {m.hiddenPrereqs.length === 1 ? "It's a prerequisite" : "They're prerequisites"} you need before you can
            register for the ones that are. That&rsquo;s the real cost.
          </p>
        </Appear>
      )}

      <PlanRoadmap />

      <div className="hero-action">
        <Button block icon={m.planCopied ? 'check' : 'copy'} onClick={() => void m.copyPlan()}>
          {m.planCopied ? 'Copied' : 'Copy plan for my advisor'}
        </Button>
      </div>
      {m.planText !== null && (
        <>
          <p className="footnote">Copying was blocked here, so select the plan below and copy it yourself.</p>
          <textarea className="plan-text" readOnly rows={8} value={m.planText} />
        </>
      )}
      <p className="footnote">
        Prerequisites come from catalogue.usask.ca verbatim; nothing here is inferred. What we can&rsquo;t know is which
        terms a course actually runs in, so confirm that with your advisor before you register.
      </p>

      <Sheet open={m.sheet === 'addTarget'} onClose={() => m.setSheet(null)} title="Plan another alongside">
        <p className="lead">Courses shared between targets are planned once and count for both.</p>
        <SectionLabel>You&rsquo;re close to</SectionLabel>
        <Group>
          {m.addableTargets.map((t, i) => (
            <Row
              key={t.spec.id}
              index={i}
              leading={<Ring done={t.doneCount} total={t.totalRequired} size={40} stroke={4} />}
              title={t.spec.name}
              subtitle={`${KIND_LABEL[m.kindOf(t.spec.id)]} · ${t.remaining} left`}
              trailing={<Icon name="plus" size={20} className="row__add" />}
              onClick={() => {
                m.setExtraTargetIds((ids) => [...ids, t.spec.id])
                m.setSheet(null)
              }}
            />
          ))}
        </Group>
      </Sheet>
    </>
  )
}
