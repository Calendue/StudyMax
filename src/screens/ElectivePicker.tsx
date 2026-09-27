import { useMemo, useState } from 'react'
import { useModel } from '../model.ts'
import { courseCode, plural } from '../format.ts'
import { electiveLabel } from '../lib/plan.ts'
import { catalogueUrl, searchCourses } from '../lib/courseSearch.ts'
import { electiveCandidates } from '../lib/electiveChoices.ts'
import { clearElective, pickElective, useElectivePicks } from '../lib/electivePicks.ts'
import { haptic } from '../platform.ts'
import { Button, Group, Row } from '../ui/primitives.tsx'
import { Icon } from '../ui/Icon.tsx'
import { Sheet } from '../ui/Sheet.tsx'

const SHOWN = 60

/** Picks a real course for one elective slot, from the courses that fit it in its term. */
export function ElectivePicker({ slot, open, onClose }: { slot: string; open: boolean; onClose: () => void }) {
  const m = useModel()
  const picks = useElectivePicks()
  const [query, setQuery] = useState('')

  const candidates = useMemo(
    () => (open ? electiveCandidates({ slot, degree: m.activeDegree, roadmap: m.roadmap, completed: m.completed, picks }) : []),
    [open, slot, m.activeDegree, m.roadmap, m.completed, picks],
  )
  const term = m.roadmap.find((t) => t.courses.some((c) => c.code === slot))?.label
  const shown = query.trim() ? searchCourses(query, SHOWN, candidates) : candidates.slice(0, SHOWN)

  function choose(code: string) {
    haptic.selection()
    pickElective(slot, code)
    setQuery('')
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose} title={`Choose your ${electiveLabel(slot).toLowerCase()}`} tall>
      <p className="footnote elective-picker__lead">
        {plural(candidates.length, 'course')} fit{candidates.length === 1 ? 's' : ''} this spot
        {term ? ` in ${term}` : ''}: offered then, and you&rsquo;ll have the prerequisites.
      </p>
      <div className="field field--search">
        <Icon name="search" size={20} />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by code or title"
          aria-label="Search courses that fit"
          autoComplete="off"
        />
      </div>
      {shown.length > 0 ? (
        <Group className="elective-picker__list">
          {shown.map((c, i) => (
            <Row
              key={c.code}
              index={Math.min(i, 8)}
              title={courseCode(c.code)}
              subtitle={c.title}
              selected={picks[slot] === c.code}
              trailing={picks[slot] === c.code ? <Icon name="check" size={18} /> : undefined}
              onClick={() => choose(c.code)}
            />
          ))}
        </Group>
      ) : (
        <p className="footnote">
          {candidates.length === 0 ? 'No course in the catalogue fits this spot in this term.' : 'No course that fits matches that.'}
        </p>
      )}
      {!query.trim() && candidates.length > SHOWN && (
        <p className="footnote">Showing the first {SHOWN}. Search to find the rest.</p>
      )}
    </Sheet>
  )
}

/** An elective slot's detail: the course picked for it, or a way to pick one. */
export function ElectiveChoice({ slot }: { slot: string }) {
  const m = useModel()
  const picks = useElectivePicks()
  const [picking, setPicking] = useState(false)
  const pick = picks[slot]
  return (
    <>
      {pick ? (
        <>
          <p className="footnote">
            Your pick: <strong>{courseCode(pick)}</strong>, {m.courseTitle(pick)}.
          </p>
          <div className="course-detail__actions">
            <Button variant="secondary" icon="compare" onClick={() => setPicking(true)}>
              Change course
            </Button>
            <Button variant="quiet" onClick={() => clearElective(slot)}>
              Leave it open
            </Button>
          </div>
          <a className="btn btn--quiet btn--block course-detail__link" href={catalogueUrl(pick)} target="_blank" rel="noreferrer">
            <Icon name="external" size={20} />
            Open {courseCode(pick)} in catalogue
          </a>
        </>
      ) : (
        <>
          <p className="footnote">Your degree needs a course of this kind here. Any one that fits counts.</p>
          <Button block icon="plus" onClick={() => setPicking(true)}>
            Choose a course
          </Button>
        </>
      )}
      <ElectivePicker slot={slot} open={picking} onClose={() => setPicking(false)} />
    </>
  )
}
