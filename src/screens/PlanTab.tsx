import { useLayoutEffect, useState } from 'react'
import { useModel } from '../model.ts'
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
import { TalkToMax } from '../maxLive/MaxLiveBar.tsx'
import { PhonePlanHeader } from './PhonePlanHeader.tsx'
import { PlanSettingsSheet } from './PlanSettingsSheet.tsx'
export { PlanControls } from './PlanControls.tsx'
import { useRegistrationRequest } from './register/useRegistration.ts'

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

/**
 * Registering for the plan's next term with Max, on its own row under the targets. Hidden until that
 * term has something to register (a named course, or an elective slot Max can fill). Secondary: the
 * plan's one primary is copying it for an advisor.
 */
export function RegisterEntry() {
  const m = useModel()
  const request = useRegistrationRequest()
  if (!request) return null
  return (
    <Appear index={1} className="plan-register">
      <Button variant="secondary" icon="calendar" onClick={() => m.go('register')}>
        Register for {request.termLabel} with Max
      </Button>
    </Appear>
  )
}

export function HiddenPrereqsNotice() {
  const m = useModel()
  if (m.hero.spec.unavailable) {
    return (
      <Appear index={2} className="notice">
        <p>
          <strong>{m.hero.spec.name} can&rsquo;t be finished from the 2026-27 catalogue.</strong> {m.hero.spec.unavailable}.
          The plan covers the rest of it; ask the department what replaces it.
        </p>
      </Appear>
    )
  }
  if (m.hiddenPrereqs.length === 0) return null
  return (
    <Appear index={2} className="notice">
      <p>
        <strong>
          {plural(m.hiddenPrereqs.length, 'course')} below {m.hiddenPrereqs.length === 1 ? "isn't" : "aren't"} on the
          specialization or degree page.
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
          {m.planCopied ? 'Copied' : 'Copy plan'}
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
        {m.activeDegree
          ? `The plan is the whole ${m.activeDegree.name} from the 2026-27 catalogue: ${m.activeDegree.totalCu} credit units, ${m.activeDegree.minSeniorCu} of them at the 200 level or higher, at most 15 a term. `
          : "The plan covers your major's requirements; add breadth and electives with an advisor. "}
        Prerequisites come from catalogue.usask.ca verbatim, and each course sits in a term it ran in on USask&rsquo;s class
        search over the last two years. Schedules can change, so confirm with your advisor before you register.
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
  const [headerHeight, setHeaderHeight] = useState(56)
  useLayoutEffect(() => {
    if (view === 'roadmap') document.querySelector('.screen__body')?.scrollTo(0, 0)
  }, [view])
  if (view === 'tree') {
    // The tree opens at its roots and grows up; the plan's settings sit under the roots.
    return (
      <>
        <PhonePlanHeader view={view} onChange={setView} onSettings={() => m.openSheet('plan-settings')} onHeight={setHeaderHeight} />
        <SkillTree bleed stickyTop={headerHeight} />
        <div className="plan-after">
          {m.plan.length > 0 && (
            <p className="lead">
              <PlanLead />
            </p>
          )}
          <TalkToMax />
          <PlanTargets />
          <RegisterEntry />
          <PlanSettingsSheet />
          {m.plan.length > 0 && <PlanCopy />}
        </div>
        <AddTargetSheet />
        <WhatIfSheet />
        <ShareSheet />
      </>
    )
  }
  if (m.plan.length === 0) {
    return (
      <>
        <PlanViewSwitch view={view} onChange={setView} onSettings={() => m.openSheet('plan-settings')} />
        <PlanEmpty />
        <PlanSettingsSheet />
      </>
    )
  }
  return (
    <>
      <PlanViewSwitch view={view} onChange={setView} onSettings={() => m.openSheet('plan-settings')} />
      <ScreenTitle lead={<PlanLead />}>Your plan</ScreenTitle>
      <PlanTargets />
      <RegisterEntry />
      <PlanSettingsSheet />
      <HiddenPrereqsNotice />
      <PlanRoadmap />
      <PlanCopy />
      <AddTargetSheet />
      <WhatIfSheet />
      <ShareSheet />
    </>
  )
}
