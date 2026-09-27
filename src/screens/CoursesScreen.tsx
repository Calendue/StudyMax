import { useMemo, useState } from 'react'
import { useModel } from '../model.ts'
import { courseCode } from '../format.ts'
import { catalogueCourses, artsAndScienceSubjects } from '../data/courses.ts'
import { ActionBar, ScreenBody, ScreenTitle, TopBar } from '../ui/chrome.tsx'
import { Icon } from '../ui/Icon.tsx'
import { Appear, Button, Chip, Group, IconButton, Row, RowIcon, SectionLabel } from '../ui/primitives.tsx'
import { Sheet } from '../ui/Sheet.tsx'

// Arts & Science courses only, grouped by subject: the college this app's programs live in. The rest
// of USask's catalogue stays reachable through search, not this list.
const AS_SUBJECT_CODES = new Set(artsAndScienceSubjects.map((s) => s.code))
export const COURSES_BY_SUBJECT = new Map<string, typeof catalogueCourses>()
for (const course of catalogueCourses) {
  const subject = course.code.match(/^[A-Z]+/)?.[0] ?? ''
  if (!AS_SUBJECT_CODES.has(subject)) continue
  const list = COURSES_BY_SUBJECT.get(subject)
  if (list) list.push(course)
  else COURSES_BY_SUBJECT.set(subject, [course])
}

export function CoursesScreen() {
  const m = useModel()
  const count = m.takenCourses.length
  return (
    <>
      <TopBar onBack={m.back} />
      <ScreenBody>
        <ScreenTitle lead={<CoursesLead />}>Add your courses</ScreenTitle>
        <UploadCard />
        <UploadNotices />
        <Group>
          <SampleRow />
          <Row
            index={2}
            leading={<RowIcon name="search" />}
            title="Search the catalogue"
            subtitle={`All ${catalogueCourses.length.toLocaleString()} USask courses, by code or title`}
            onClick={() => m.openSheet('search')}
          />
          <Row
            index={3}
            leading={<RowIcon name="browse" />}
            title="Browse by subject"
            subtitle={`${artsAndScienceSubjects.length} Arts & Science subjects`}
            onClick={() => m.openSheet('browse')}
          />
        </Group>
        <CompletedList />
        <InProgressList />
      </ScreenBody>

      <RevealBar count={count} />

      <SearchSheet />
      <BrowseSheet />
    </>
  )
}

export function CoursesLead() {
  const m = useModel()
  return (
    <>
      {m.selectedProgram?.name ?? 'Your program'} at USask.{' '}
      {m.features.ai ? 'Your transcript is the fastest way in.' : 'Try the sample student, or add yours by search.'}
    </>
  )
}

/** Reading a transcript needs the OpenAI key; without it the card isn't offered at all. */
export function UploadCard() {
  const m = useModel()
  if (!m.features.ai) return null
  return (
    <Appear index={0}>
      <label className="upload">
        <input
          type="file"
          accept="application/pdf"
          className="visually-hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = '' // allow re-uploading the same filename later
            if (file) void m.handleTranscriptFile(file)
          }}
        />
        <span className="upload__icon">
          <Icon name="upload" size={26} />
        </span>
        <span className="upload__text">
          <span className="upload__title">Upload your transcript</span>
          <span className="upload__hint">A DegreeWorks audit or unofficial transcript, as a PDF. StudyMax reads every course on it.</span>
        </span>
      </label>
    </Appear>
  )
}

export function UploadNotices() {
  const m = useModel()
  const count = m.takenCourses.length
  const inProgress = m.uploadInProgress
  return (
    <>
      {(m.uploadStatus === 'success' || m.uploadStatus === 'sample') && (
        <Appear index={0} className="notice notice--ok">
          <Icon name="check" size={20} />
          <p>
            {m.uploadStatus === 'sample' ? 'Loaded a sample USask Computer Science student: ' : 'Found '}
            {count} completed course{count === 1 ? '' : 's'}
            {inProgress.length > 0 ? ` and ${inProgress.length} in progress` : ''}. Check them below.
          </p>
        </Appear>
      )}
      {m.uploadStatus === 'error' && m.uploadError && (
        <Appear index={0} className="notice">
          <p>{m.uploadError}</p>
        </Appear>
      )}
    </>
  )
}

export function SampleRow() {
  const m = useModel()
  return (
    <Row
      index={1}
      leading={<RowIcon name="person" />}
      title="Load a sample student"
      subtitle="A real USask Computer Science audit, for a quick look"
      onClick={m.loadSampleStudent}
    />
  )
}

export function CompletedList({ label = true }: { label?: boolean }) {
  const m = useModel()
  const count = m.takenCourses.length
  if (count === 0) return null
  return (
    <>
      {label && (
        <Appear index={4}>
          <SectionLabel>
            Completed <span className="section-label__count tnum">{count}</span>
          </SectionLabel>
        </Appear>
      )}
      <Group>
        {m.takenCourses.map((code, i) => (
          <Row
            key={code}
            index={4 + i}
            title={courseCode(code)}
            subtitle={m.courseTitle(code)}
            trailing={<IconButton icon="close" label={`Remove ${courseCode(code)}`} onClick={() => m.toggleCourse(code)} />}
          />
        ))}
      </Group>
    </>
  )
}

export function InProgressList() {
  const m = useModel()
  const inProgress = m.uploadInProgress
  if (inProgress.length === 0) return null
  return (
    <>
      <SectionLabel>Taking now</SectionLabel>
      <Group>
        {inProgress.map((code, i) => (
          <Row key={code} index={i} title={courseCode(code)} subtitle={m.courseTitle(code)} trailing={<Chip>In progress</Chip>} />
        ))}
      </Group>
      <p className="footnote">Courses in progress don&rsquo;t count yet. They&rsquo;re planned around, not planned again.</p>
    </>
  )
}

/** The screen's one hero action: into the reveal, or back to it with the courses updated. */
export function RevealBar({ count }: { count: number }) {
  const m = useModel()
  return (
    <ActionBar note={count === 0 ? 'Add at least one course to see what it opens up.' : undefined}>
      <Button block disabled={count === 0} onClick={m.startReveal}>
        {m.revealed ? 'Update my results' : 'Reveal my path'}
      </Button>
    </ActionBar>
  )
}

/** The catalogue search: a field and its hits. In a sheet on a phone, inline on the desktop. */
export function SearchPanel({ autoFocus }: { autoFocus?: boolean }) {
  const m = useModel()
  const query = m.courseQuery.trim()
  return (
    <>
      <div className="field field--search">
        <Icon name="search" size={20} />
        <input
          type="search"
          enterKeyHint="done"
          autoFocus={autoFocus}
          value={m.courseQuery}
          onChange={(e) => m.setCourseQuery(e.target.value)}
          onKeyDown={(e) => {
            // Enter takes the top hit that isn't already added, so pressing it again walks the list
            // instead of re-adding the same course.
            const next = m.courseResults.find((c) => !m.completed.has(c.code))
            if (e.key === 'Enter' && next) {
              e.preventDefault()
              m.addCourse(next.code)
            }
          }}
          placeholder="CMPT 280, or data structures"
          aria-label="Search for a course by code or title"
          autoComplete="off"
        />
      </div>
      {query.length === 0 ? (
        <p className="empty">Include courses outside your program too. They&rsquo;re often what puts a certificate or minor within reach.</p>
      ) : m.courseResults.length === 0 ? (
        <p className="empty">No course in the catalogue matches &ldquo;{query}&rdquo;.</p>
      ) : (
        <Group>
          {m.courseResults.map((c, i) => {
            const added = m.completed.has(c.code)
            return (
              <Row
                key={c.code}
                index={i}
                title={courseCode(c.code)}
                subtitle={c.title}
                selected={added}
                trailing={<Icon name={added ? 'check' : 'plus'} size={20} className={added ? 'row__check' : 'row__add'} />}
                onClick={() => (added ? m.toggleCourse(c.code) : m.addCourse(c.code))}
              />
            )
          })}
        </Group>
      )}
    </>
  )
}

function SearchSheet() {
  const m = useModel()
  return (
    <Sheet
      open={m.sheet === 'search'}
      onClose={() => m.setSheet(null)}
      title="Search the catalogue"
      tall
      footer={
        <Button block variant="secondary" onClick={() => m.setSheet(null)}>
          Done{m.completed.size > 0 ? `, ${m.completed.size} added` : ''}
        </Button>
      }
    >
      <SearchPanel />
    </Sheet>
  )
}

function BrowseSheet() {
  const m = useModel()
  const [openSubject, setOpenSubject] = useState<string | null>(null)
  const counts = useMemo(() => {
    const map = new Map<string, number>()
    for (const code of m.completed) {
      const subject = code.match(/^[A-Z]+/)?.[0] ?? ''
      map.set(subject, (map.get(subject) ?? 0) + 1)
    }
    return map
  }, [m.completed])

  const subject = openSubject ? artsAndScienceSubjects.find((s) => s.code === openSubject) : null
  const subjectCourses = openSubject ? (COURSES_BY_SUBJECT.get(openSubject) ?? []) : []

  return (
    <Sheet
      open={m.sheet === 'browse'}
      onClose={() => {
        setOpenSubject(null)
        m.setSheet(null)
      }}
      title={subject ? subject.name : 'Browse by subject'}
      tall
      footer={
        subject ? (
          <Button block variant="secondary" icon="back" onClick={() => setOpenSubject(null)}>
            All subjects
          </Button>
        ) : undefined
      }
    >
      {subject ? (
        <Group key={subject.code}>
          {subjectCourses.map((c, i) => {
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
      ) : (
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
                onClick={() => {
                  setOpenSubject(s.code)
                  document.querySelector('.sheet__body')?.scrollTo({ top: 0 })
                }}
              />
            )
          })}
        </Group>
      )}
    </Sheet>
  )
}
