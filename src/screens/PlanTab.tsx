import { useModel } from '../model.ts'
import { MAX_COURSES_PER_TERM, MAX_SUMMER_COURSES } from '../lib/cloudSession.ts'
import { KIND_LABEL, plural } from '../format.ts'
import { ScreenTitle } from '../ui/chrome.tsx'
import { Icon } from '../ui/Icon.tsx'
import { Appear, Button, Group, Ring, Row, SectionLabel } from '../ui/primitives.tsx'
import { Sheet } from '../ui/Sheet.tsx'
import { WhatIfSheet } from './WhatIfSheet.tsx'
import { ShareSheet } from './ShareSheet.tsx'
import { PlanRoadmap } from './PlanRoadmap.tsx'
import { SkillTree } from '../skilltree/SkillTree.tsx'
import { PlanViewSwitch } from '../skilltree/PlanViewSwitch.tsx'
import { usePlanView } from '../skilltree/planView.ts'

// The plan's pieces, shared by the phone's Plan tab and the desktop's Plan page.

/** Nothing left to plan: everything outstanding is in progress, or the target is finished. */
export function PlanEmpty() {
  const m = useModel()
  // Targets with courses left but no plan: everything left is being taken right now.
  const lead =
    m.targets.length > 0
      ? `Everything left for ${m.hero.spec.name} is in progress now. Finish those and it's done. Pick another target on the Closest tab to plan it too.`
      : `You've finished ${m.hero.spec.name}. Pick another target on the Closest tab to plan it.`
  return (
    <>
      <ScreenTitle lead={lead}>Your plan</ScreenTitle>
      <Button block variant="secondary" onClick={() => m.navigate('overview')}>
        See what you&rsquo;re close to
      </Button>
    </>
  )
}

export function PlanLead() {
  const m = useModel()
  const last = m.plan[m.plan.length - 1]
  return (
    <>
      {plural(m.plan.length, 'term')} to finish, by <strong>{last?.label}</strong>. Where a requirement gave you a choice,
      we picked the course that also counts toward the most other credentials.
    </>
  )
}

/** What's being planned: the target, anything planned alongside it, and a way to add another. */
export function PlanTargets() {
  const m = useModel()
  return (
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
      <button type="button" className="chip chip--add" onClick={() => m.openSheet('whatif')}>
        <Icon name="compare" size={14} />
        What if…
      </button>
    </Appear>
  )
}

/** Spring/Summer: off, or the most courses a Spring/Summer term may take. */
const SUMMER_CHOICES = [0, ...Array.from({ length: MAX_SUMMER_COURSES }, (_, i) => i + 1)]

/** Courses per term (Fall/Winter and Spring/Summer), and the term it starts in. */
export function PlanControls() {
  const m = useModel()
  const summer = m.springSummer ? m.summerPerTerm : 0
  return (
    <>
      <Appear index={1} className="per-term">
        <span id="per-term-label">Courses per term</span>
        <div className="segmented" role="radiogroup" aria-labelledby="per-term-label">
          {Array.from({ length: MAX_COURSES_PER_TERM }, (_, i) => i + 1).map((n) => (
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
        <span id="summer-label">Spring/Summer</span>
        <div className="segmented" role="radiogroup" aria-labelledby="summer-label">
          {SUMMER_CHOICES.map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={summer === n}
              aria-label={n === 0 ? 'No Spring/Summer terms' : `Up to ${n} in a Spring/Summer term`}
              className={`segmented__option${summer === n ? ' segmented__option--on' : ''}`}
              onClick={() => {
                m.setSpringSummer(n > 0)
                if (n > 0) m.setSummerPerTerm(n)
              }}
            >
              {n === 0 ? 'Off' : n}
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
    </>
  )
}

export function HiddenPrereqsNotice() {
  const m = useModel()
  if (m.hiddenPrereqs.length === 0) return null
  return (
    <Appear index={2} className="notice">
      <p>
        <strong>
          {plural(m.hiddenPrereqs.length, 'course')} below {m.hiddenPrereqs.length === 1 ? "isn't" : "aren't"} on the
          specialization page.
        </strong>{' '}
        {m.hiddenPrereqs.length === 1 ? "It's a prerequisite" : "They're prerequisites"} you need before you can register
        for the ones that are. That&rsquo;s the real cost.
      </p>
    </Appear>
  )
}

/** Copy the plan for an advisor, with the hand-copy fallback where the clipboard is blocked. */
export function PlanCopy() {
  const m = useModel()
  return (
    <>
      <div className="hero-action">
        <Button block icon={m.planCopied ? 'check' : 'copy'} onClick={() => void m.copyPlan()}>
          {m.planCopied ? 'Copied' : 'Copy plan for my advisor'}
        </Button>
        <Button block variant="secondary" icon="share" onClick={() => m.openSheet('share')}>
          Share my plan as an image
        </Button>
      </div>
      {m.planText !== null && (
        <>
          <p className="footnote">Copying was blocked here, so select the plan below and copy it yourself.</p>
          <textarea className="plan-text" readOnly rows={8} value={m.planText} />
        </>
      )}
      <p className="footnote">
        Prerequisites come from catalogue.usask.ca verbatim; nothing here is inferred. What we can&rsquo;t know is which terms
        a course actually runs in, so confirm that with your advisor before you register.
      </p>
    </>
  )
}

export function AddTargetSheet() {
  const m = useModel()
  return (
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
  )
}

export function PlanTab() {
  const m = useModel()
  const [view, setView] = usePlanView()
  if (view === 'tree') {
    // The tree opens at its roots and grows up; the plan's settings sit under the roots.
    return (
      <>
        <PlanViewSwitch view={view} onChange={setView} sticky />
        <SkillTree bleed stickyTop={56} />
        <div className="plan-after">
          {m.plan.length > 0 && (
            <p className="lead">
              <PlanLead />
            </p>
          )}
          <PlanTargets />
          <PlanControls />
          {m.plan.length > 0 && <PlanCopy />}
        </div>
        <AddTargetSheet />
      </>
    )
  }
  if (m.plan.length === 0) {
    return (
      <>
        <PlanViewSwitch view={view} onChange={setView} />
        <PlanEmpty />
      </>
    )
  }
  return (
    <>
      <PlanViewSwitch view={view} onChange={setView} />
      <ScreenTitle lead={<PlanLead />}>Your plan</ScreenTitle>
      <PlanTargets />
      <PlanControls />
      <HiddenPrereqsNotice />
      <PlanRoadmap />
      <PlanCopy />
      <AddTargetSheet />
      <WhatIfSheet />
      <ShareSheet />
    </>
  )
}
