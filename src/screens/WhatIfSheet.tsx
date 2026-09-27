import { useMemo } from 'react'
import { useModel } from '../model.ts'
import { KIND_LABEL, courseCode, plural } from '../format.ts'
import { compareTargets, delta, type TargetOutlook } from '../lib/whatIf.ts'
import { Icon } from '../ui/Icon.tsx'
import { Button, Chip, Group, Row } from '../ui/primitives.tsx'
import { Sheet } from '../ui/Sheet.tsx'

// "What if I went for X instead?": pick any other credential in reach and see it next to the current
// target, each planned on its own with the student's own pace and start term.
//   sheet 'whatif'      the list to pick from
//   sheet 'whatif:<id>' the comparison with that one

export function WhatIfSheet() {
  const m = useModel()
  const open = m.sheet === 'whatif' || !!m.sheet?.startsWith('whatif:')
  const otherId = m.sheet?.startsWith('whatif:') ? m.sheet.slice('whatif:'.length) : null
  const choices = useMemo(
    () => [...m.matches, ...m.credentials].filter((x) => x.remaining > 0 && x.spec.id !== m.hero.spec.id),
    [m.matches, m.credentials, m.hero],
  )
  const other = choices.find((x) => x.spec.id === otherId) ?? null

  const { planningSpecs, completed, inProgressCourses, coursesPerTerm, startTerm, springSummer, booked, hero } = m
  const result = useMemo(
    () =>
      other
        ? compareTargets(hero, other, {
            planningSpecs,
            completed,
            inProgress: inProgressCourses,
            coursesPerTerm,
            start: startTerm,
            springSummer,
            booked,
          })
        : null,
    [other, hero, planningSpecs, completed, inProgressCourses, coursesPerTerm, startTerm, springSummer, booked],
  )

  return (
    <Sheet
      open={open}
      onClose={() => m.setSheet(null)}
      title={other ? 'What if…' : 'What if I went for something else?'}
      tall
      footer={
        other ? (
          <>
            <Button block onClick={() => m.planTarget(other.spec.id)}>
              Switch my plan to {other.spec.name}
            </Button>
            <Button block variant="quiet" onClick={() => m.setSheet('whatif')}>
              Compare a different one
            </Button>
          </>
        ) : undefined
      }
    >
      {result ? (
        <Comparison current={result.current} other={result.other} shared={result.shared} />
      ) : choices.length === 0 ? (
        <p className="empty">Nothing else is in reach yet. Add more courses and the alternatives show up here.</p>
      ) : (
        <>
          <p className="footnote">
            Compared with <strong>{m.hero.spec.name}</strong>, at {plural(coursesPerTerm, 'course')} a term from{' '}
            {startTerm.season} {startTerm.year}.
          </p>
          <Group>
            {choices.map((x, i) => (
              <Row
                key={x.spec.id}
                index={i}
                title={x.spec.name}
                subtitle={`${KIND_LABEL[m.kindOf(x.spec.id)]} · ${plural(x.remaining, 'course')} to go`}
                onClick={() => m.setSheet(`whatif:${x.spec.id}`)}
              />
            ))}
          </Group>
        </>
      )}
    </Sheet>
  )
}

function Comparison({ current, other, shared }: { current: TargetOutlook; other: TargetOutlook; shared: string[] }) {
  const m = useModel()
  const rows: { label: string; a: string; b: string; change: string }[] = [
    {
      label: 'Courses to take',
      a: String(current.required),
      b: String(other.required),
      change: delta(current.required, other.required, 'course'),
    },
    {
      label: 'Hidden prerequisites',
      a: String(current.prerequisites),
      b: String(other.prerequisites),
      change: delta(current.prerequisites, other.prerequisites, 'prereq'),
    },
    { label: 'Terms', a: String(current.terms), b: String(other.terms), change: delta(current.terms, other.terms, 'term') },
    { label: 'Done by', a: current.finish ?? 'After this term', b: other.finish ?? 'After this term', change: '' },
  ]
  // Fewer terms is the headline; a tie falls back to fewer courses.
  const better =
    other.terms !== current.terms ? other.terms < current.terms : other.required + other.prerequisites < current.required + current.prerequisites
  const same = other.terms === current.terms && other.required + other.prerequisites === current.required + current.prerequisites
  return (
    <>
      <div className="whatif" role="table" aria-label="Current target compared with the alternative">
        <div className="whatif__row whatif__row--head" role="row">
          <span role="columnheader" />
          <span role="columnheader" className="whatif__name">
            <span className="eyebrow">Now</span>
            {current.match.spec.name}
          </span>
          <span role="columnheader" className="whatif__name whatif__name--other">
            <span className="eyebrow">What if</span>
            {other.match.spec.name}
          </span>
        </div>
        {rows.map((r) => (
          <div key={r.label} className="whatif__row" role="row">
            <span role="rowheader" className="whatif__label">
              {r.label}
            </span>
            <span role="cell" className="tnum">
              {r.a}
            </span>
            <span role="cell" className="whatif__other">
              <span className="tnum">{r.b}</span>
              {r.change && r.change !== 'same' && <Chip>{r.change}</Chip>}
            </span>
          </div>
        ))}
      </div>

      <p className={`whatif__verdict${!same && better ? ' whatif__verdict--better' : ''}`}>
        <Icon name={!same && better ? 'check' : 'target'} size={18} />
        {same
          ? 'About the same distance. Pick the one you’d rather have on your transcript.'
          : better
            ? `${other.match.spec.name} gets you a credential sooner.`
            : `${current.match.spec.name} is still the quicker finish.`}
      </p>

      {shared.length > 0 && (
        <p className="footnote">
          {plural(shared.length, 'course')} count toward both ({shared.slice(0, 4).map(courseCode).join(', ')}
          {shared.length > 4 ? ', …' : ''}), so starting with {shared.length === 1 ? 'it' : 'those'} keeps both doors open.
        </p>
      )}
      {m.extraTargetIds.length > 0 && (
        <p className="footnote">Each is planned on its own here; your current plan also includes the extra targets you added.</p>
      )}
    </>
  )
}
