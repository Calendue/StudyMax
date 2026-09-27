import { useEffect, useMemo, useRef, useState } from 'react'
import { useReducedMotion } from 'motion/react'
import { useModel } from '../model.ts'
import { firstName } from '../auth.ts'
import { catalogueTitle } from '../lib/courseSearch.ts'
import { isElective } from '../lib/plan.ts'
import { haptic } from '../platform.ts'
import {
  pickSchedule,
  optionsFor,
  load,
  save,
  clear,
  type RegRow,
  type RegState,
  type RegStep,
} from '../lib/mockRegistration.ts'
import { Icon } from '../ui/Icon.tsx'
import './register.css'

// A fake, deterministic "class registration" page: Max drives a look-alike of the university's own
// registration portal (layout only — no crest, no wordmark, no real student name). Reached only from
// the "Register with Max" button on the Plan; not a nav destination.

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

function optionKey(courseIndex: number, section: string) {
  return `${courseIndex}-${section}`
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

export function RegisterScreen() {
  const m = useModel()
  const reduce = useReducedMotion()
  const term = m.plan[0]
  const termLabel = term?.label ?? 'this term'
  const studentName = firstName(m.account) ?? 'Student'

  const courses = useMemo(
    () =>
      (term?.courses ?? [])
        .filter((c) => !isElective(c.code))
        .map((c) => ({ code: c.code, title: catalogueTitle(c.code) ?? c.code, credits: 3 })),
    [term],
  )
  const coursesKey = courses.map((c) => c.code).join(',')
  const colorOf = (code: string) => COLORS[courses.findIndex((c) => c.code === code) % COLORS.length]

  const [saved, setSaved] = useState<RegState | null>(null)
  const [steps, setSteps] = useState<RegStep[]>([])
  const [rows, setRows] = useState<RegRow[]>([])
  const [stepIndex, setStepIndex] = useState(0)
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
  const submitBtnRef = useRef<HTMLButtonElement>(null)
  const addRefs = useRef(new Map<string, HTMLButtonElement | null>())
  const [cursorRect, setCursorRect] = useState<{ left: number; top: number } | null>(null)

  // Keyed on the course codes, not just the term label: the label can settle before the plan's
  // course list does, and generating against an empty list would poison the save.
  useEffect(() => {
    if (courses.length === 0) return
    const existing = load(termLabel)
    if (existing) {
      setSaved(existing)
      setRows(existing.rows)
      setSteps([])
      setStepIndex(-1)
      return
    }
    const { rows: picked, steps: script } = pickSchedule(courses)
    setSaved(null)
    setRows(picked)
    setSteps(script)
    setAddedRows(new Set())
    setStepIndex(reduce ? script.length : 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [termLabel, coursesKey])

  const currentStep = stepIndex >= 0 && stepIndex < steps.length ? steps[stepIndex] : null

  // Advance one step at a time, revealing typed characters and marking rows added along the way.
  useEffect(() => {
    if (saved || reduce || !currentStep) return
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
    if (currentStep.action === 'search' || currentStep.action === 'add' || currentStep.action === 'submit') {
      setClicking(true)
      clickTimer.current = window.setTimeout(() => setClicking(false), 250)
    }
    timer.current = window.setTimeout(() => setStepIndex((s) => s + 1), STEP_DELAY_MS)
    return () => {
      if (timer.current) window.clearTimeout(timer.current)
      if (typeTimer.current) window.clearInterval(typeTimer.current)
      if (clickTimer.current) window.clearTimeout(clickTimer.current)
    }
  }, [stepIndex, steps, saved, reduce]) // eslint-disable-line react-hooks/exhaustive-deps

  // Finalize once the script runs out. Guarded on steps.length: on the very first render, stepIndex
  // (0) and steps.length (0) are both untouched defaults, which would otherwise satisfy "done"
  // vacuously and save an empty registration before the script above even generates one.
  useEffect(() => {
    if (saved || steps.length === 0 || stepIndex < steps.length) return
    const registered = rows.map((r) => ({ ...r, status: 'registered' as const }))
    setRows(registered)
    haptic.medium()
    const finished: RegState = { termLabel, rows: registered, submittedAt: new Date().toISOString() }
    save(finished)
    setSaved(finished)
  }, [stepIndex, steps.length, saved, rows, termLabel])

  // Move the cursor to whatever the current step targets.
  useEffect(() => {
    if (saved || reduce || !currentStep || !containerRef.current) {
      setCursorRect(null)
      return
    }
    const container = containerRef.current.getBoundingClientRect()
    let target: HTMLElement | null | undefined
    if (currentStep.action === 'type-subject') target = subjectRef.current
    else if (currentStep.action === 'type-number') target = numberRef.current
    else if (currentStep.action === 'search') target = searchBtnRef.current
    else if (currentStep.action === 'submit') target = submitBtnRef.current
    else if (currentStep.action === 'add' && currentStep.rowIndex !== undefined) {
      const row = rows[currentStep.rowIndex]
      target = row ? addRefs.current.get(optionKey(activeCourseIndex, row.section)) : null
    }
    if (!target) return
    const rect = target.getBoundingClientRect()
    setCursorRect({ left: rect.left - container.left + rect.width / 2 - 4, top: rect.top - container.top + rect.height / 2 - 4 })
  }, [currentStep, saved, reduce, rows, activeCourseIndex])

  function skip() {
    if (timer.current) window.clearTimeout(timer.current)
    if (typeTimer.current) window.clearInterval(typeTimer.current)
    setStepIndex(steps.length)
  }

  function reset() {
    clear()
    setSaved(null)
    const { rows: picked, steps: script } = pickSchedule(courses)
    setRows(picked)
    setSteps(script)
    setAddedRows(new Set())
    setStepIndex(0)
  }

  const done = saved !== null
  const visibleRows = done ? rows : rows.filter((_, i) => addedRows.has(i))
  const totalCredits = rows.reduce((sum, r) => sum + r.credits, 0)
  const registeredCount = visibleRows.filter((r) => r.status === 'registered').length
  const showResults = !done && (currentStep?.action === 'search' || currentStep?.action === 'add')
  const activeCourse = courses[activeCourseIndex]
  const results = showResults && activeCourse ? optionsFor(activeCourse.code) : []
  const canSubmit = !done && visibleRows.length > 0
  const currentBubbleText = done
    ? `Registered: ${totalCredits} credit unit${totalCredits === 1 ? '' : 's'} for ${termLabel}`
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
        <button type="button" className="reg-back" onClick={() => m.navigate('plan')}>
          ‹ Back to plan
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
                <span className="reg-search__term">Term: {termLabel}</span>
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
                {results.map((opt, i) => {
                  const isFull = activeCourseIndex === 0 && opt.type === 'Lecture' && i === 0
                  const added = rows.some((r, ri) => addedRows.has(ri) && r.crn === opt.crn)
                  return (
                    <tr key={opt.crn}>
                      <td>{opt.crn}</td>
                      <td>{opt.section}</td>
                      <td>{opt.type}</td>
                      <td>{opt.days.join(' ')}</td>
                      <td>
                        {opt.start}-{opt.end}
                      </td>
                      <td>{isFull ? <span className="reg-full">FULL</span> : '12'}</td>
                      <td>
                        <button
                          ref={(el) => void addRefs.current.set(optionKey(activeCourseIndex, opt.section), el)}
                          type="button"
                          className="reg-btn reg-btn--add"
                          disabled={isFull || added}
                        >
                          {added ? 'Added' : 'Add'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
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
          <p className="reg-caption">Class Schedule for {termLabel}</p>
          <div className="reg-week">
            {DAYS.map((day) => (
              <div key={day} className="reg-week__col">
                <span className="reg-week__day">{day}</span>
                <div className="reg-week__track">
                  {visibleRows
                    .filter((r) => r.days.includes(day))
                    .map((r, i) => {
                      const top = ((toMinutes(r.start) - GRID_START_MIN) / (GRID_END_MIN - GRID_START_MIN)) * 100
                      const height = ((toMinutes(r.end) - toMinutes(r.start)) / (GRID_END_MIN - GRID_START_MIN)) * 100
                      return (
                        <div
                          key={`${r.crn}-${day}-${i}`}
                          className={`reg-week__block ${colorOf(r.code)}${r.status === 'registered' ? ' reg-week__block--in' : ' reg-week__block--pending'}`}
                          style={{ top: `${top}%`, height: `${height}%` }}
                        >
                          {r.status === 'registered' && <Icon name="check" size={12} />}
                          <span className="reg-week__title">{r.code}</span>
                        </div>
                      )
                    })}
                </div>
              </div>
            ))}
          </div>
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
                  <td>{r.crn}</td>
                  <td>
                    {r.code} {r.section}
                  </td>
                  <td className="reg-summary__title">{r.title}</td>
                  <td>{r.type}</td>
                  <td>{r.credits}</td>
                  <td>
                    <span className={`reg-pill reg-pill--${r.status === 'registered' ? 'registered' : 'pending'}`}>
                      {r.status === 'registered' ? 'Registered' : 'Pending'}
                    </span>
                  </td>
                  <td>
                    <span className="reg-select">None ▾</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="reg-summary__footer">
            Total Credits | Registered: {registeredCount} | Credits: {totalCredits} | CEU: 0 | Min: 0 | Max: 18
          </div>
        </section>
      </div>

      <footer className="reg-bottom">
        <span className="reg-panels">Panels ▾</span>
        <div className="reg-bottom__right">
          <label className="reg-check">
            <input type="checkbox" disabled />
            Switch class sections (prior to registration deadline)
          </label>
          <button ref={submitBtnRef} type="button" className="reg-btn reg-btn--submit" disabled={!canSubmit}>
            Submit
          </button>
        </div>
      </footer>

      <div className="reg-bubble">
        <span className="reg-bubble__avatar">
          <Icon name="person" size={16} />
        </span>
        <div className="reg-bubble__body">
          {!done ? (
            <>
              <p className="reg-bubble__line">
                {stepIndex >= 0 && stepIndex < steps.length ? <span className="spinner" /> : <Icon name="check" size={16} />}
                {currentBubbleText}
              </p>
              <button type="button" className="reg-bubble__skip" onClick={skip}>
                Skip
              </button>
            </>
          ) : (
            <>
              <p className="reg-bubble__line">
                <Icon name="check" size={16} />
                {currentBubbleText}
              </p>
              <div className="reg-bubble__actions">
                <button type="button" className="reg-bubble__link" onClick={() => m.navigate('plan')}>
                  Back to plan
                </button>
                <button type="button" className="reg-bubble__link" onClick={reset}>
                  Reset demo
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
