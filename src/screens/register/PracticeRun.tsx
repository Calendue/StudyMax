import { useEffect, useMemo, useRef, useState } from 'react'
import { useReducedMotion } from 'motion/react'
import { useModel } from '../../model.ts'
import { firstName } from '../../auth.ts'
import { haptic } from '../../platform.ts'
import { clear, load, save, scriptFromPlan, storageKey, typeWord, type RegRow, type RegScope, type RegState } from '../../lib/mockRegistration.ts'
import type { RegPlan } from '../../lib/registration.ts'
import { MaxOwl } from '../../ui/MaxOwl.tsx'
import { Icon } from '../../ui/Icon.tsx'
import { timeText } from './sectionText.ts'

// The practice run: a simulated look-alike of the university's registration page (layout only: no
// crest, no wordmark, no sign-in step) where Max plays out his REAL picks for the term, with their
// real CRNs, sections, times and seats. Max fills the summary and stops, as he does on PAWS: the
// student presses the simulated Submit. Nothing is sent anywhere; the "Simulated · demo" tag says so.

const STEP_DELAY_MS = 700
const TYPE_CHAR_MS = 60
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const GRID_START_MIN = 8 * 60
const GRID_END_MIN = 18 * 60
const COLORS = ['reg-c0', 'reg-c1', 'reg-c2', 'reg-c3', 'reg-c4']

function toMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

/** The week's hours: 8 AM to 6 PM, stretched to the hour to fit an earlier or later section. */
function gridWindow(rows: RegRow[]): { start: number; end: number } {
  let start = GRID_START_MIN
  let end = GRID_END_MIN
  for (const r of rows) {
    for (const mt of r.meetings) {
      start = Math.min(start, Math.floor(toMinutes(mt.start) / 60) * 60)
      end = Math.max(end, Math.ceil(toMinutes(mt.end) / 60) * 60)
    }
  }
  return { start, end }
}

/** The absolutely-positioned pointer that glides to each target before its "click". */
function AgentCursor({ rect, clicking }: { rect: { left: number; top: number } | null; clicking: boolean }) {
  if (!rect) return null
  return (
    <div className={`reg-cursor${clicking ? ' reg-cursor--click' : ''}`} style={{ left: rect.left, top: rect.top }}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M5 3l14 8-6 1.5L11 19z" fill="currentColor" />
      </svg>
    </div>
  )
}

/**
 * Keyed on the saved run's scope (student, term, CRNs), so a different list starts a fresh run
 * instead of inheriting another one's progress.
 */
export function PracticeRun({ plan, onBack, scroll }: { plan: RegPlan; onBack: () => void; scroll: boolean }) {
  const m = useModel()
  const scope = useMemo<RegScope>(
    () => ({ uid: m.account?.uid ?? null, termLabel: plan.request.termLabel, crns: plan.crns }),
    [m.account?.uid, plan.request.termLabel, plan.crns],
  )
  const page = <Run key={storageKey(scope)} plan={plan} scope={scope} onBack={onBack} />
  // On a phone the screen has no scroller of its own (the root never scrolls); in the shell the page does.
  return scroll ? <main className="screen__body">{page}</main> : page
}

function Run({ plan, scope, onBack }: { plan: RegPlan; scope: RegScope; onBack: () => void }) {
  const m = useModel()
  const reduce = useReducedMotion()
  const termLabel = scope.termLabel
  const studentName = firstName(m.account) ?? 'Student'
  const script = useMemo(() => scriptFromPlan(plan), [plan])
  const { courses, booked, steps } = script
  // The script always ends on its ready beat, where Max waits for the student's Submit.
  const readyIndex = steps.length - 1
  const colorOf = (code: string) => COLORS[Math.max(0, courses.findIndex((c) => c.code === code)) % COLORS.length]

  // A finished run for this scope opens finished; otherwise the script starts, or, under reduced
  // motion, jumps straight to its ready beat (never past it: Submit stays the student's).
  const [initial] = useState(() => {
    const existing = load(scope)
    return existing
      ? { saved: existing, rows: existing.rows, stepIndex: -1 }
      : { saved: null, rows: script.rows, stepIndex: reduce ? readyIndex : 0 }
  })
  const [saved, setSaved] = useState<RegState | null>(initial.saved)
  const [rows, setRows] = useState<RegRow[]>(initial.rows)
  const [stepIndex, setStepIndex] = useState(initial.stepIndex)
  const [addedRows, setAddedRows] = useState<Set<number>>(new Set())
  const [activeCourseIndex, setActiveCourseIndex] = useState(0)
  const [typedSubject, setTypedSubject] = useState('')
  const [typedNumber, setTypedNumber] = useState('')
  const [clicking, setClicking] = useState(false)
  const timer = useRef<number | null>(null)
  const typeTimer = useRef<number | null>(null)
  const clickTimer = useRef<number | null>(null)

  const containerRef = useRef<HTMLDivElement>(null)
  const subjectRef = useRef<HTMLInputElement>(null)
  const numberRef = useRef<HTMLInputElement>(null)
  const searchBtnRef = useRef<HTMLButtonElement>(null)
  const addRefs = useRef(new Map<number, HTMLButtonElement | null>())
  const [cursorRect, setCursorRect] = useState<{ left: number; top: number } | null>(null)

  const currentStep = stepIndex >= 0 && stepIndex < steps.length ? steps[stepIndex] : null

  // Advance one step at a time, revealing typed characters and marking rows added along the way. The
  // ready beat never advances by itself: only the student's Submit ends the run.
  useEffect(() => {
    if (saved || !currentStep || currentStep.action === 'ready') return
    // Reduced motion switched on mid-run: go to the ready beat rather than wait on timers that never start.
    if (reduce) {
      setStepIndex(readyIndex)
      return
    }
    if (currentStep.courseIndex !== undefined) setActiveCourseIndex(currentStep.courseIndex)
    if (currentStep.action === 'type-subject' || currentStep.action === 'type-number') {
      const full = (currentStep.action === 'type-subject' ? currentStep.subject : currentStep.number) ?? ''
      const setter = currentStep.action === 'type-subject' ? setTypedSubject : setTypedNumber
      setter('')
      let i = 0
      typeTimer.current = window.setInterval(() => {
        i++
        setter(full.slice(0, i))
        if (i >= full.length && typeTimer.current) window.clearInterval(typeTimer.current)
      }, TYPE_CHAR_MS)
    }
    if (currentStep.action === 'add' && currentStep.rowIndex !== undefined) {
      const rowIndex = currentStep.rowIndex
      setAddedRows((set) => new Set(set).add(rowIndex))
      haptic.selection()
    }
    if (currentStep.action === 'search' || currentStep.action === 'add') {
      setClicking(true)
      clickTimer.current = window.setTimeout(() => setClicking(false), 250)
    }
    timer.current = window.setTimeout(() => setStepIndex((s) => s + 1), STEP_DELAY_MS)
    return () => {
      if (timer.current) window.clearTimeout(timer.current)
      if (typeTimer.current) window.clearInterval(typeTimer.current)
      if (clickTimer.current) window.clearTimeout(clickTimer.current)
    }
  }, [stepIndex, steps, saved, reduce, readyIndex]) // eslint-disable-line react-hooks/exhaustive-deps

  // Move the cursor to whatever the current step targets. On the ready beat it goes: Max's hands are off.
  useEffect(() => {
    if (saved || reduce || !currentStep || currentStep.action === 'ready' || !containerRef.current) {
      setCursorRect(null)
      return
    }
    const container = containerRef.current.getBoundingClientRect()
    let target: HTMLElement | null | undefined
    if (currentStep.action === 'type-subject') target = subjectRef.current
    else if (currentStep.action === 'type-number') target = numberRef.current
    else if (currentStep.action === 'search') target = searchBtnRef.current
    else if (currentStep.action === 'add' && currentStep.rowIndex !== undefined) target = addRefs.current.get(currentStep.rowIndex)
    if (!target) return
    const rect = target.getBoundingClientRect()
    setCursorRect({ left: rect.left - container.left + rect.width / 2 - 4, top: rect.top - container.top + rect.height / 2 - 4 })
  }, [currentStep, saved, reduce, rows, activeCourseIndex])

  function skip() {
    if (timer.current) window.clearTimeout(timer.current)
    if (typeTimer.current) window.clearInterval(typeTimer.current)
    setStepIndex(readyIndex)
  }

  const done = saved !== null
  const ready = !done && currentStep?.action === 'ready'

  /**
   * The student's own tap on the simulated Submit: every added section is registered, except a full
   * one, which Banner would refuse.
   */
  function submit() {
    if (!ready) return
    const registered = rows.map((r) => ({ ...r, status: r.seatStatus === 'full' ? ('error' as const) : ('registered' as const) }))
    setRows(registered)
    haptic.medium()
    const finished: RegState = { termLabel, rows: registered, submittedAt: new Date().toISOString() }
    save(scope, finished)
    setSaved(finished)
  }

  function reset() {
    clear(scope)
    setSaved(null)
    setRows(script.rows)
    setAddedRows(new Set())
    setTypedSubject('')
    setTypedNumber('')
    // Under reduced motion there are no timers to run the script, so it goes straight to the ready beat.
    setStepIndex(reduce ? readyIndex : 0)
  }

  // On the ready beat everything is in the summary (under reduced motion, without the adds played out).
  const visibleRows = done || ready ? rows : rows.filter((_, i) => addedRows.has(i))
  // Only what's in the summary counts, and only lectures carry credit units.
  const credits = visibleRows.filter((r) => r.main).reduce((sum, r) => sum + r.credits, 0)
  const registeredCredits = visibleRows.filter((r) => r.main && r.status === 'registered').reduce((sum, r) => sum + r.credits, 0)
  const registeredCount = visibleRows.filter((r) => r.status === 'registered').length
  const showResults = !done && (currentStep?.action === 'search' || currentStep?.action === 'add')
  const activeCourse = courses[activeCourseIndex]
  const results = showResults && activeCourse ? rows.map((r, i) => ({ r, i })).filter(({ r }) => r.code === activeCourse.code) : []
  const canSubmit = ready && visibleRows.length > 0
  const week = [...booked, ...visibleRows]
  const { start: gridStart, end: gridEnd } = gridWindow(week)
  const bubbleText = done
    ? `Practice done: ${registeredCredits} credit unit${registeredCredits === 1 ? '' : 's'} for ${termLabel}. Nothing was sent to USask.`
    : (currentStep?.text ?? '')

  return (
    <div className="reg-page" ref={containerRef}>
      <AgentCursor rect={cursorRect} clicking={clicking} />

      <header className="reg-top">
        <div className="reg-top__left">
          <Icon name="grid" size={20} />
          <span className="reg-top__logo">
            Registration <span className="reg-tag">Simulated · demo</span>
          </span>
        </div>
        <div className="reg-top__right">
          <Icon name="settings" size={18} />
          <span className="reg-avatar">
            <Icon name="person" size={16} />
          </span>
          <span className="reg-top__name">{studentName}</span>
        </div>
      </header>

      <nav className="reg-crumbs" aria-label="Breadcrumb">
        <button type="button" className="reg-back" onClick={onBack}>
          ‹ Back to registration
        </button>
        <span className="reg-crumb">Student</span>
        <span className="reg-dot">·</span>
        <span className="reg-crumb">Registration</span>
        <span className="reg-dot">·</span>
        <span className="reg-crumb">Select a Term</span>
        <span className="reg-dot">·</span>
        <span className="reg-crumb reg-crumb--current">Register for Classes</span>
      </nav>

      <h1 className="reg-h1">Register for Classes</h1>

      <div className="reg-tabs">
        <span className="reg-tab reg-tab--active">Find Classes</span>
        <span className="reg-tab">Enter CRNs</span>
        <span className="reg-tab">Plans</span>
        <span className="reg-tab">Schedule and Options</span>
      </div>

      {!done && (
        <section className="reg-search">
          {!showResults ? (
            <>
              <div className="reg-search__head">
                <strong>Enter Your Search Criteria</strong> <span className="reg-info">ⓘ</span>
                <span className="reg-search__term">
                  Term: {termLabel}
                  {plan.preview && <span className="reg-search__note">on {plan.preview.termLabel}&rsquo;s timetable</span>}
                </span>
              </div>
              <div className="reg-search__form">
                <label className="reg-field">
                  <span>Subject</span>
                  <input ref={subjectRef} readOnly value={typedSubject} placeholder="" />
                </label>
                <label className="reg-field reg-field--short">
                  <span>Course Number</span>
                  <input ref={numberRef} readOnly value={typedNumber} placeholder="e.g. 110" />
                </label>
                <label className="reg-field">
                  <span>Campus</span>
                  <input readOnly value="" placeholder="" />
                </label>
              </div>
              <div className="reg-search__actions">
                <button ref={searchBtnRef} type="button" className="reg-btn reg-btn--search" disabled>
                  Search
                </button>
                <span className="reg-link">Clear</span>
                <span className="reg-link">▸ Advanced Search</span>
              </div>
            </>
          ) : (
            <div className="reg-results-wrap">
              <table className="reg-results">
                <thead>
                  <tr>
                    <th>CRN</th>
                    <th>Section</th>
                    <th>Type</th>
                    <th>Days</th>
                    <th>Time</th>
                    <th>Seats</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {results.map(({ r, i }) => {
                    const full = r.seatStatus === 'full'
                    const added = addedRows.has(i)
                    return (
                      <tr key={r.crn}>
                        <td data-label="CRN">{r.crn}</td>
                        <td data-label="Section">{r.section}</td>
                        <td data-label="Type">{typeWord(r.type)}</td>
                        <td data-label="Days">
                          {r.meetings.length === 0 ? 'TBA' : r.meetings.map((mt, k) => <div key={k}>{mt.days.join(' ')}</div>)}
                        </td>
                        <td data-label="Time">
                          {r.meetings.length === 0
                            ? 'TBA'
                            : r.meetings.map((mt, k) => (
                                <div key={k}>
                                  {timeText(mt.start)}–{timeText(mt.end)}
                                </div>
                              ))}
                        </td>
                        <td data-label="Seats">{full ? <span className="reg-full">FULL</span> : r.seats}</td>
                        <td>
                          <button
                            ref={(el) => void addRefs.current.set(i, el)}
                            type="button"
                            className="reg-btn reg-btn--add"
                            disabled={full || added}
                          >
                            {added ? 'Added' : 'Add'}
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <div className="reg-splitter" aria-hidden>
        <span>▲</span>
        <span>•</span>
        <span>▼</span>
      </div>

      <div className="reg-panes">
        <section className="reg-schedule">
          <div className="reg-pane-tabs">
            <span className="reg-pane-tab reg-pane-tab--active">
              <Icon name="calendar" size={16} /> Schedule
            </span>
            <span className="reg-pane-tab">Schedule Details</span>
          </div>
          <p className="reg-caption">
            Class Schedule for {termLabel}
            {plan.preview && <span className="reg-search__note">on {plan.preview.termLabel}&rsquo;s timetable</span>}
          </p>
          <div className="reg-week">
            {DAYS.map((day) => (
              <div key={day} className="reg-week__col">
                <span className="reg-week__day">{day}</span>
                <div className="reg-week__track">
                  {week.flatMap((r, ri) =>
                    r.meetings
                      .filter((mt) => mt.days.includes(day))
                      .map((mt, k) => {
                        const top = ((toMinutes(mt.start) - gridStart) / (gridEnd - gridStart)) * 100
                        const height = ((toMinutes(mt.end) - toMinutes(mt.start)) / (gridEnd - gridStart)) * 100
                        const isBooked = ri < booked.length
                        const state = isBooked
                          ? 'reg-week__block--booked'
                          : r.status === 'registered'
                            ? `${colorOf(r.code)} reg-week__block--in`
                            : `${colorOf(r.code)} reg-week__block--pending`
                        return (
                          <div
                            key={`${r.crn}-${day}-${k}`}
                            className={`reg-week__block ${state}`}
                            style={{ top: `${top}%`, height: `${height}%` }}
                            title={isBooked ? `${r.code} (already registered)` : r.code}
                          >
                            {(isBooked || r.status === 'registered') && <Icon name="check" size={12} />}
                            <span className="reg-week__title">{r.code}</span>
                          </div>
                        )
                      }),
                  )}
                </div>
              </div>
            ))}
          </div>
          {booked.length > 0 && <p className="reg-caption reg-caption--key">Grey: already registered this term</p>}
        </section>

        <section className="reg-summary">
          <div className="reg-summary__head">
            <Icon name="table" size={16} />
            <strong>Summary</strong>
          </div>
          <table className="reg-summary__table">
            <thead>
              <tr>
                <th>CRN</th>
                <th>Details</th>
                <th>Title</th>
                <th>Schedule Type</th>
                <th>Credits</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((r, i) => (
                <tr key={`${r.crn}-${i}`}>
                  <td className="reg-sum__crn">{r.crn}</td>
                  <td className="reg-sum__details">
                    {r.code} {r.section}
                  </td>
                  <td className="reg-summary__title">{r.title}</td>
                  <td className="reg-sum__type">{typeWord(r.type)}</td>
                  <td className="reg-sum__credits">{r.credits}</td>
                  <td className="reg-sum__status">
                    <span className={`reg-pill reg-pill--${r.status}`}>
                      {r.status === 'registered' ? 'Registered' : r.status === 'error' ? 'Errors' : 'Pending'}
                    </span>
                  </td>
                  <td className="reg-sum__action">
                    <span className="reg-select">None ▾</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="reg-summary__footer">
            Total Credits | Registered: {registeredCount} | Credits: {credits} | CEU: 0 | Min: 0 | Max: 18
          </div>
        </section>
      </div>

      <div className="reg-dock">
      <div className="reg-bubble" aria-live="polite">
        <span className="reg-bubble__avatar" aria-hidden>
          <MaxOwl size={40} pose={done || ready ? 'celebrating' : 'thinking'} />
        </span>
        <div className="reg-bubble__body">
          {!done ? (
            <>
              <p className="reg-bubble__line">
                {currentStep && !ready ? <span className="spinner" /> : <Icon name="check" size={16} />}
                {bubbleText}
              </p>
              {!ready && (
                <button type="button" className="reg-bubble__skip" onClick={skip}>
                  Skip
                </button>
              )}
            </>
          ) : (
            <>
              <p className="reg-bubble__line">
                <Icon name="check" size={16} />
                {bubbleText}
              </p>
              <div className="reg-bubble__actions">
                <button type="button" className="reg-bubble__link" onClick={onBack}>
                  Back to registration
                </button>
                <button type="button" className="reg-bubble__link" onClick={reset}>
                  Run it again
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      <footer className="reg-bottom">
        <span className="reg-panels">Panels ▾</span>
        <div className="reg-bottom__right">
          <label className="reg-check">
            <input type="checkbox" disabled />
            Switch class sections (prior to registration deadline)
          </label>
          <button
            type="button"
            className={`reg-btn reg-btn--submit${canSubmit ? ' reg-btn--ready' : ''}`}
            disabled={!canSubmit}
            onClick={submit}
          >
            Submit
          </button>
        </div>
      </footer>

      </div>
    </div>
  )
}
