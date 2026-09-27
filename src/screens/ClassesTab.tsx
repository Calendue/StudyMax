import { useEffect, useState } from 'react'
import { useModel } from '../model.ts'
import { courseCode } from '../format.ts'
import { bannerTermCode, formatMeeting, openSeats, PAWS_URL, statusLabel, type Section, type Term, type Watch } from '../lib/classTracker.ts'
import { ScreenTitle } from '../ui/chrome.tsx'
import { Icon } from '../ui/Icon.tsx'
import { Appear, Button, Chip, Group, Row, SectionLabel, Skeleton } from '../ui/primitives.tsx'

// The class tracker, ported from CalenDue: find a course's sections for a USask term, watch the full
// ones, and hear the moment a seat opens. StudyMax never registers anyone; PAWS does that.

/** A whole course code, "CMPT 280" or "cmpt280": enough to ask which terms run it. */
const FULL_CODE = /^[A-Z]{2,5}\s*\d{3}[A-Z]?$/i

function listTerms(names: string[]) {
  return names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

function checkedAt(ms: number) {
  return new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

export function ClassesTab() {
  const m = useModel()
  const c = m.classes
  const [query, setQuery] = useState('')

  const { ensureTerms, checkOffered, clearOffered } = c
  useEffect(() => ensureTerms(), [ensureTerms])

  // Once a full course code is typed, each term says whether it runs it. Debounced so typing
  // "CMPT 2" on the way to "CMPT 280" doesn't ask Banner about CMPT 2.
  const typed = query.trim()
  useEffect(() => {
    if (!FULL_CODE.test(typed)) {
      clearOffered()
      return
    }
    const id = window.setTimeout(() => void checkOffered(typed), 450)
    return () => window.clearTimeout(id)
  }, [typed, checkOffered, clearOffered])

  const terms = c.terms.state === 'done' ? c.terms.value.filter((t) => !t.viewOnly) : []
  // The plan's first term, if Banner has it open: its courses are the ones worth grabbing a seat in.
  const nextTerm = m.plan[0]
  const nextTermCode = nextTerm ? bannerTermCode(nextTerm.label) : null
  const planCourses = nextTerm && terms.some((t) => t.code === nextTermCode) ? nextTerm.courses.map((p) => p.code) : []
  const offeredBy = c.offered?.byTerm.state === 'done' ? c.offered.byTerm.value : null

  function find(code: string) {
    setQuery(courseCode(code))
    void c.search(code, nextTermCode ?? c.term)
  }

  return (
    <>
      {c.alert && <OpeningAlert watch={c.alert} onDismiss={c.dismissAlert} />}

      <ScreenTitle lead="Watch a full section and StudyMax tells you the moment a seat opens, live from USask's class search. Registering still happens in PAWS.">
        Grab a seat
      </ScreenTitle>

      {c.terms.state === 'loading' && <Skeleton lines={1} />}
      {c.terms.state === 'error' && (
        <div className="notice">
          <p>{c.terms.message}</p>
          <Button variant="quiet" onClick={() => void c.loadTerms()}>
            Retry
          </Button>
        </div>
      )}

      {terms.length > 0 && (
        <>
          <div className="chips classes__terms" role="radiogroup" aria-label="Term">
            {terms.map((t) => (
              <button
                key={t.code}
                type="button"
                role="radio"
                aria-checked={c.term === t.code}
                className={`chip ${c.term === t.code ? 'chip--target' : 'chip--add'}${offeredBy?.[t.code] === 0 ? ' classes__term--off' : ''}`}
                onClick={() => c.chooseTerm(t.code)}
              >
                {(offeredBy?.[t.code] ?? 0) > 0 && <Icon name="check" size={14} />}
                {t.description}
                {offeredBy?.[t.code] === 0 && <span className="visually-hidden">, not offered</span>}
              </button>
            ))}
          </div>
          {c.offered && <OfferedNote terms={terms} />}

          {planCourses.length > 0 && (
            <>
              <SectionLabel>From your plan, {nextTerm.label}</SectionLabel>
              <div className="chips">
                {planCourses.map((code) => (
                  <button key={code} type="button" className="chip chip--add" onClick={() => find(code)}>
                    {courseCode(code)}
                  </button>
                ))}
              </div>
            </>
          )}

          <form
            className="classes__search"
            onSubmit={(e) => {
              e.preventDefault()
              void c.search(query)
            }}
          >
            <div className="field field--search">
              <Icon name="search" size={20} />
              <input
                type="search"
                enterKeyHint="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="CMPT 370"
                aria-label="Course code"
                autoComplete="off"
                autoCapitalize="characters"
              />
            </div>
          </form>

          <Sections />
        </>
      )}

      <Watching />
    </>
  )
}

/** The line under the terms saying which of them run the course typed in the search. */
function OfferedNote({ terms }: { terms: Term[] }) {
  const offered = useModel().classes.offered
  if (!offered) return null
  const code = courseCode(offered.course)
  const s = offered.byTerm
  let text: string
  if (s.state === 'done') {
    const running = terms.filter((t) => (s.value[t.code] ?? 0) > 0).map((t) => t.description)
    const unknown = terms.some((t) => s.value[t.code] === null)
    text = running.length
      ? `${code} runs in ${listTerms(running)}.`
      : unknown
        ? `Couldn't confirm which terms run ${code}.`
        : `${code} isn't offered in any term open for registration.`
  } else if (s.state === 'error') {
    text = `Couldn't check which terms run ${code}.`
  } else {
    text = `Checking which terms run ${code}…`
  }
  const good = s.state === 'done' && terms.some((t) => (s.value[t.code] ?? 0) > 0)
  return (
    <p className={`classes__offered${good ? ' classes__offered--yes' : ''}`} role="status" aria-live="polite">
      {good && <Icon name="check" size={16} />}
      {text}
    </p>
  )
}

function Sections() {
  const c = useModel().classes
  const s = c.sections
  if (s.state === 'idle') return null
  if (s.state === 'loading') return <Skeleton lines={3} />
  if (s.state === 'error') {
    return (
      <div className="notice">
        <p>{s.message}</p>
        <Button variant="quiet" onClick={() => void c.search(c.course)}>
          Retry
        </Button>
      </div>
    )
  }
  if (s.value.length === 0) return <p className="empty">No sections of {courseCode(c.course)} this term.</p>
  const title = s.value[0].courseTitle
  return (
    <>
      <SectionLabel>
        {courseCode(c.course)}
        {title ? `, ${title}` : ''}
      </SectionLabel>
      <Group>
        {s.value.map((section, i) => (
          <SectionRow key={section.crn} section={section} index={i} />
        ))}
      </Group>
      {s.value.some((x) => x.isSectionLinked) && (
        <p className="footnote">Some sections are linked to a lab or tutorial. PAWS will ask you to register for both.</p>
      )}
    </>
  )
}

function SectionRow({ section, index }: { section: Section; index: number }) {
  const c = useModel().classes
  const watching = c.isWatching(section)
  const seats = section.status === 'waitlist' ? section.waitAvailable : openSeats(section)
  const when = section.meetings.map(formatMeeting).join('; ') || 'Times TBA'
  return (
    <Row
      index={index}
      title={`Section ${section.sectionNumber}${section.scheduleType ? ` · ${section.scheduleType}` : ''}`}
      subtitle={
        <>
          {when}
          {section.instructors[0] && <> · {section.instructors[0]}</>}
          <span className="classes__status">
            <Chip tone={section.status === 'open' ? 'urgent' : 'quiet'}>{statusLabel(section.status, seats)}</Chip>
            {section.hasReservedSeats && <span> Some seats are reserved.</span>}
          </span>
        </>
      }
      trailing={
        watching ? (
          <span className="classes__watching">
            <Icon name="check" size={18} /> Watching
          </span>
        ) : section.status === 'open' ? (
          <a className="inline-link" href={PAWS_URL} target="_blank" rel="noreferrer">
            Register
          </a>
        ) : (
          <Button variant="secondary" icon="plus" onClick={() => c.watch(section)}>
            Watch
          </Button>
        )
      }
    />
  )
}

function Watching() {
  const c = useModel().classes
  if (c.watches.length === 0) return null
  const lastChecked = Math.max(...c.watches.map((w) => w.checkedAt))
  return (
    <>
      <SectionLabel
        action={
          <button type="button" className="inline-link" disabled={c.checking} onClick={() => void c.checkNow()}>
            {c.checking ? 'Checking…' : `Checked ${checkedAt(lastChecked)}`}
          </button>
        }
      >
        Watching
      </SectionLabel>
      <Group>
        {c.watches.map((w, i) => (
          <Row
            key={`${w.term}:${w.crn}`}
            index={i}
            title={`${courseCode(`${w.subject}${w.courseNumber}`)} · ${w.sectionNumber}`}
            subtitle={
              <>
                {w.termDesc} · {w.when}
                <span className="classes__status">
                  <Chip tone={w.status === 'open' ? 'urgent' : 'quiet'}>{statusLabel(w.status, w.seats)}</Chip>
                </span>
              </>
            }
            trailing={
              <button type="button" className="icon-btn" aria-label="Stop watching" onClick={() => c.unwatch(w.crn, w.term)}>
                <Icon name="close" size={18} />
              </button>
            }
          />
        ))}
      </Group>
      <p className="footnote">
        StudyMax re-checks about once a minute while it&rsquo;s open.{' '}
        <button
          type="button"
          className="inline-link"
          onClick={() => {
            const target = c.watches.find((w) => w.status !== 'open') ?? c.watches[0]
            c.simulateOpening(target.crn, target.term)
          }}
        >
          Demo: simulate an opening
        </button>
      </p>
    </>
  )
}

function OpeningAlert({ watch, onDismiss }: { watch: Watch; onDismiss: () => void }) {
  return (
    <Appear className="spotlight classes__alert">
      <Chip tone="urgent" icon="clock">
        Seat open now
      </Chip>
      <h2 className="spotlight__name">
        {courseCode(`${watch.subject}${watch.courseNumber}`)} · Section {watch.sectionNumber}
      </h2>
      <p className="spotlight__why">
        {watch.courseTitle}, {watch.termDesc}. Seats go fast; register before someone else does.
      </p>
      <a className="btn btn--primary btn--block" href={PAWS_URL} target="_blank" rel="noreferrer" onClick={onDismiss}>
        <Icon name="external" size={20} />
        Register in PAWS
      </a>
      <Button variant="quiet" block onClick={onDismiss}>
        Later
      </Button>
    </Appear>
  )
}
