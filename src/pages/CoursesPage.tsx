import { useMemo, useState } from 'react'
import { useModel } from '../model.ts'
import { courseCode } from '../format.ts'
import { artsAndScienceSubjects, catalogueCourses } from '../data/courses.ts'
import { Icon } from '../ui/Icon.tsx'
import { Button, Chip, Group, Row } from '../ui/primitives.tsx'
import {
  COURSES_BY_SUBJECT,
  CompletedList,
  InProgressList,
  SampleRow,
  SearchPanel,
  UploadCard,
  UploadNotices,
} from '../screens/CoursesScreen.tsx'
import { Card } from './Card.tsx'

/** Every Arts & Science subject, then one subject's courses to tick. Inline, where a phone uses a sheet. */
function BrowsePanel() {
  const m = useModel()
  const [open, setOpen] = useState<string | null>(null)
  const counts = useMemo(() => {
    const map = new Map<string, number>()
    for (const code of m.completed) {
      const subject = code.match(/^[A-Z]+/)?.[0] ?? ''
      map.set(subject, (map.get(subject) ?? 0) + 1)
    }
    return map
  }, [m.completed])
  const subject = open ? artsAndScienceSubjects.find((s) => s.code === open) : null

  if (subject) {
    return (
      <>
        <button type="button" className="inline-link browse__back" onClick={() => setOpen(null)}>
          <Icon name="back" size={16} /> All subjects
        </button>
        <p className="browse__subject">{subject.name}</p>
        <Group key={subject.code}>
          {(COURSES_BY_SUBJECT.get(subject.code) ?? []).map((c, i) => {
            const taken = m.completed.has(c.code)
            return (
              <Row
                key={c.code}
                index={i}
                title={courseCode(c.code)}
                subtitle={c.title}
                selected={taken}
                trailing={<Icon name={taken ? 'check' : 'plus'} size={20} className={taken ? 'row__check' : 'row__add'} />}
                onClick={() => m.toggleCourse(c.code)}
              />
            )
          })}
        </Group>
      </>
    )
  }
  return (
    <Group>
      {artsAndScienceSubjects.map((s, i) => {
        const taken = counts.get(s.code) ?? 0
        return (
          <Row
            key={s.code}
            index={i}
            title={s.name}
            subtitle={`${s.code} · ${(COURSES_BY_SUBJECT.get(s.code) ?? []).length} courses`}
            trailing={
              <span className="row__meta">
                {taken > 0 && <Chip>{taken} added</Chip>}
                <Icon name="chevron" size={18} className="row__chevron" />
              </span>
            }
            onClick={() => setOpen(s.code)}
          />
        )
      })}
    </Group>
  )
}

// The desktop's Courses: what the student is taking now leads the page, what they've finished sits
// under it, and finding more courses (upload, search or browse) is the side column.
export function CoursesPage() {
  const m = useModel()
  const [mode, setMode] = useState<'search' | 'browse'>('search')
  const count = m.takenCourses.length
  const current = m.inProgressCourses
  const empty = count === 0 && current.length === 0
  return (
    <div className="page courses-page">
      <div className="courses-page__mine">
        <Card index={0} title="Taking now" icon="clock" className="courses-page__current">
          {current.length > 0 ? (
            <>
              <p className="courses-page__count">
                <span className="tnum">{current.length}</span> {current.length === 1 ? 'course' : 'courses'} in progress
              </p>
              <InProgressList label={false} />
            </>
          ) : empty ? (
            <>
              <p className="card__empty">No courses yet. Upload a transcript, search, or start from a real student.</p>
              <Group>
                <SampleRow />
              </Group>
            </>
          ) : (
            <p className="card__empty">
              Nothing in progress. Upload a transcript with this term on it and your current courses show up here.
            </p>
          )}
        </Card>

        {count > 0 && (
          <Card index={1} title="Completed" icon="check" className="courses-page__list">
            <p className="courses-page__count">
              <span className="tnum">{count}</span> completed
            </p>
            <CompletedList label={false} />
          </Card>
        )}
      </div>

      <aside className="courses-page__find">
        <div className="courses-page__action">
          {m.revealed && !m.resultsStale ? (
            // Results recompute as courses change; replaying the reveal is only worth offering once
            // the list differs from the one it last ran on.
            <p className="footnote courses-page__uptodate">
              <Icon name="check" size={16} /> Your results already include every course here.
            </p>
          ) : (
            <Button block disabled={count === 0} onClick={m.startReveal}>
              {m.revealed ? 'Update my results' : 'Reveal my path'}
            </Button>
          )}
          {count === 0 && <p className="footnote">Add at least one course to see what it opens up.</p>}
          {count > 0 && m.uploadStatus !== 'sample' && (
            <button type="button" className="inline-link courses-page__sample" onClick={m.loadSampleStudent}>
              Or load a sample student
            </button>
          )}
        </div>
        <UploadCard />
        <UploadNotices />
        <Card
          index={2}
          title="Add courses"
          icon="plus"
          action={
            <div className="segmented segmented--labels segmented--small" role="radiogroup" aria-label="How to add">
              {(['search', 'browse'] as const).map((id) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={mode === id}
                  className={`segmented__option${mode === id ? ' segmented__option--on' : ''}`}
                  onClick={() => setMode(id)}
                >
                  <Icon name={id === 'search' ? 'search' : 'browse'} size={16} />
                  {id === 'search' ? 'Search' : 'Browse'}
                </button>
              ))}
            </div>
          }
        >
          <p className="footnote courses-page__hint">
            {mode === 'search'
              ? `All ${catalogueCourses.length.toLocaleString()} USask courses, by code or title. Enter adds the top hit.`
              : `${artsAndScienceSubjects.length} Arts & Science subjects. Tick what you've taken.`}
          </p>
          {mode === 'search' ? <SearchPanel /> : <BrowsePanel />}
        </Card>
      </aside>
    </div>
  )
}
