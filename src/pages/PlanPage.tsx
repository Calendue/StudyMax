import { useState } from 'react'
import { useModel } from '../model.ts'
import { courseCode } from '../format.ts'
import { Icon } from '../ui/Icon.tsx'
import { AddTargetSheet, HiddenPrereqsNotice, PlanControls, PlanCopy, PlanEmpty, PlanLead, PlanTargets } from '../screens/PlanTab.tsx'
import { CourseDetail, PlanRoadmap, type RoadmapSelection } from '../screens/PlanRoadmap.tsx'
import { Card } from './Card.tsx'
import { WhatIfSheet } from '../screens/WhatIfSheet.tsx'
import { ShareSheet } from '../screens/ShareSheet.tsx'

// The desktop's Plan: Ayo's roadmap across the width, and beside it a panel for the course you pick,
// the plan's settings, and the copy for an advisor. The phone shows the same pieces stacked.
export function PlanPage() {
  const m = useModel()
  const [selection, setSelection] = useState<RoadmapSelection | null>(null)

  if (m.plan.length === 0) {
    return (
      <div className="page page--narrow">
        <Card>
          <PlanEmpty />
        </Card>
      </div>
    )
  }

  return (
    <div className="page plan-page">
      <div className="plan-page__main">
        <Card index={0} className="plan-page__roadmap">
          <p className="lead plan-page__lead">
            <PlanLead />
          </p>
          <PlanTargets />
          <HiddenPrereqsNotice />
          <PlanRoadmap selected={selection?.code ?? null} onSelect={setSelection} />
        </Card>
      </div>
      <aside className="plan-page__side">
        <Card index={1} title={selection ? courseCode(selection.code) : 'Course details'} icon="browse" className="plan-page__detail">
          {selection ? (
            <>
              <CourseDetail code={selection.code} node={selection.node} />
              <button type="button" className="inline-link plan-page__clear" onClick={() => setSelection(null)}>
                Clear selection
              </button>
            </>
          ) : (
            <p className="card__empty">
              <Icon name="plan" size={20} />
              Pick a course on the roadmap to see why it&rsquo;s there, what it unlocks, and what else it counts toward.
            </p>
          )}
        </Card>
        <Card index={2} title="Plan settings" icon="settings" className="plan-page__settings">
          <PlanControls />
        </Card>
        <Card index={3}>
          <PlanCopy />
        </Card>
      </aside>
      <AddTargetSheet />
      <WhatIfSheet />
      <ShareSheet />
    </div>
  )
}
