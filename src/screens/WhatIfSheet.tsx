import { useMemo, useState } from 'react'
import { useModel } from '../model.ts'
import { MAX_COURSES_PER_TERM } from '../lib/cloudSession.ts'
import { KIND_LABEL, courseCode, plural } from '../format.ts'
import { compareTargets, delta, outlook, rankAlternatives, termShift, type WhatIf, type WhatIfInputs } from '../lib/whatIf.ts'
import { Icon } from '../ui/Icon.tsx'
import { Button, Chip, Group, Ring, Row } from '../ui/primitives.tsx'
import { Sheet } from '../ui/Sheet.tsx'

// "What if I went for X instead?": pick any other credential in reach and see it next to the current
// target, each planned on its own with the student's own start term. The pace is a what-if too: it
// changes here without touching the real plan until the student switches.
//   sheet 'whatif'      the list to pick from, quickest finish first
//   sheet 'whatif:<id>' the comparison with that one

const PACES = Array.from({ length: MAX_COURSES_PER_TERM }, (_, i) => i + 1)

export function WhatIfSheet() {
  const m = useModel()
  const open = m.sheet === 'whatif' || !!m.sheet?.startsWith('whatif:')
  const otherId = m.sheet?.startsWith('whatif:') ? m.sheet.slice('whatif:'.length) : null

  // A pace tried here lives until the sheet closes; the next visit starts from the plan's own pace.
  const [pace, setPace] = useState<number | null>(null)
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (!open) setPace(null)
  }
  const perTerm = pace ?? m.coursesPerTerm

  const choices = useMemo(
    () => [...m.matches, ...m.credentials].filter((x) => x.remaining > 0 && x.spec.id !== m.hero.spec.id),
    [m.matches, m.credentials, m.hero],
  )
  const other = choices.find((x) => x.spec.id === otherId) ?? null

  const { planningSpecs, completed, inProgressCourses, startTerm, springSummer, summerPerTerm, booked, hero } = m
  const input: WhatIfInputs = useMemo(
    () => ({ planningSpecs, completed, inProgress: inProgressCourses, coursesPerTerm: perTerm, start: startTerm, springSummer, summerPerTerm, booked }),
    [planningSpecs, completed, inProgressCourses, perTerm, startTerm, springSummer, summerPerTerm, booked],
  )
  // Only worked out while the sheet is open: it plans every alternative.
  const ranked = useMemo(() => (open && !other ? { hero: outlook(hero, input), list: rankAlternatives(choices, input) } : null), [open, other, hero, choices, input])
  const result = useMemo(() => (other ? compareTargets(hero, other, input) : null), [other, hero, input])

  const paceChanged = perTerm !== m.coursesPerTerm
  function switchTo(specId: string) {
    if (paceChanged) m.setCoursesPerTerm(perTerm)
    m.planTarget(specId)
  }

  return (
    <Sheet
      open={open}
      onClose={() => m.setSheet(null)}
      title={other ? 'What if…' : 'What if I went for something else?'}
      tall
      footer={
        other ? (
          <>
            <Button block onClick={() => switchTo(other.spec.id)}>
              Switch my plan to {other.spec.name}
              {paceChanged ? ` at ${perTerm} a term` : ''}
            </Button>
            <Button block variant="quiet" onClick={() => m.setSheet('whatif')}>
              Compare a different one
            </Button>
          </>
        ) : paceChanged ? (
          <Button block variant="secondary" onClick={() => m.setCoursesPerTerm(perTerm)}>
            Use {plural(perTerm, 'course')} a term in my plan
          </Button>
        ) : undefined
      }
    >
      {choices.length > 0 && <PacePicker value={perTerm} planned={m.coursesPerTerm} onChange={setPace} />}
      {result ? (
        <Comparison result={result} />
      ) : choices.length === 0 ? (
        <p className="empty">Nothing else is in reach yet. Add more courses and the alternatives show up here.</p>
      ) : ranked ? (
        <>
          <p className="footnote">
            Against <strong>{hero.spec.name}</strong>
            {ranked.hero.finish ? `, done ${ranked.hero.finish}` : ''}. Starting {startTerm.season} {startTerm.year}, quickest finish first.
          </p>
          <Group>
            {ranked.list.map((x, i) => {
              const shift = termShift(ranked.hero.terms, x.terms)
              const sooner = x.terms < ranked.hero.terms
              return (
                <Row
                  key={x.match.spec.id}
                  index={i}
                  leading={<Ring done={x.match.doneCount} total={x.match.totalRequired} size={36} stroke={4} />}
                  title={x.match.spec.name}
                  subtitle={`${KIND_LABEL[m.kindOf(x.match.spec.id)]} · ${plural(x.courses.length, 'course')} · ${x.finish ? `done ${x.finish}` : 'done after this term'}`}
                  trailing={<Chip tone={sooner ? 'accent' : 'quiet'}>{shift}</Chip>}
                  onClick={() => m.setSheet(`whatif:${x.match.spec.id}`)}
                />
              )
            })}
          </Group>
        </>
      ) : null}
    </Sheet>
  )
}

/** "What if I took N a term?": the same segmented control as the plan's, but only for this sheet. */
function PacePicker({ value, planned, onChange }: { value: number; planned: number; onChange: (n: number) => void }) {
  return (
    <div className="per-term whatif__pace">
      <span id="whatif-pace-label">
        Courses a term
        {value !== planned && <span className="whatif__pace-note">Your plan: {planned}</span>}
      </span>
      <div className="segmented" role="radiogroup" aria-labelledby="whatif-pace-label">
        {PACES.map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            className={`segmented__option${value === n ? ' segmented__option--on' : ''}`}
            onClick={() => onChange(n)}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  )
}

function Comparison({ result }: { result: WhatIf }) {
  const m = useModel()
  const { current, other, shared, added, dropped } = result
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
    { label: 'Terms until done', a: String(current.terms), b: String(other.terms), change: delta(current.terms, other.terms, 'term') },
    { label: 'Done by', a: current.finish ?? 'After this term', b: other.finish ?? 'After this term', change: '' },
  ]
  // Fewer terms is the headline; a tie falls back to fewer courses.
  const load = (x: typeof current) => x.required + x.prerequisites
  const same = other.terms === current.terms && load(other) === load(current)
  const better = other.terms !== current.terms ? other.terms < current.terms : load(other) < load(current)
  const otherName = other.match.spec.name
  const currentName = current.match.spec.name
  return (
    <>
      <div className="whatif" role="table" aria-label="Current target compared with the alternative">
        <div className="whatif__row whatif__row--head" role="row">
          <span role="columnheader" />
          <span role="columnheader" className="whatif__name">
            <span className="eyebrow">Now</span>
            {currentName}
          </span>
          <span role="columnheader" className="whatif__name whatif__name--other">
            <span className="eyebrow">What if</span>
            {otherName}
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
          : other.terms !== current.terms
            ? better
              ? `${otherName} finishes ${termShift(current.terms, other.terms)}${other.finish ? `, in ${other.finish}` : ''}.`
              : `${currentName} is still the quicker finish, by ${plural(other.terms - current.terms, 'term')}.`
            : better
              ? `Same finish, ${plural(load(current) - load(other), 'course')} fewer with ${otherName}.`
              : `Same finish, ${plural(load(other) - load(current), 'course')} fewer if you stay with ${currentName}.`}
      </p>

      <CourseList title="You’d add" tone="accent" codes={added} empty="Nothing new: every course is already in your plan." />
      <CourseList title="No longer needed" codes={dropped} empty="Nothing you’ve planned goes to waste." />

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

function CourseList({ title, codes, empty, tone = 'quiet' }: { title: string; codes: string[]; empty: string; tone?: 'quiet' | 'accent' }) {
  return (
    <section className="whatif__courses" aria-label={title}>
      <h3 className="eyebrow">
        {title}
        {codes.length > 0 && ` · ${codes.length}`}
      </h3>
      {codes.length === 0 ? (
        <p className="footnote">{empty}</p>
      ) : (
        <div className="whatif__chips">
          {codes.map((c) => (
            <Chip key={c} tone={tone}>
              {courseCode(c)}
            </Chip>
          ))}
        </div>
      )}
    </section>
  )
}
