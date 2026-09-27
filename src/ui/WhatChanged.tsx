import { useModel } from '../model.ts'
import { courseCode } from '../format.ts'
import { isElective } from '../lib/plan.ts'
import { overrideCause, overrideLabel, termOrd, type CourseOverride, type OverrideKind } from '../lib/overrides.ts'
import type { Diagnostic, PlanDiff } from '../lib/planner/types.ts'
import { Button } from './primitives.tsx'
import { Sheet } from './Sheet.tsx'
import './whatChanged.css'

// "Life happened": the actions that tell the planner a course was failed, withdrawn, cancelled or
// pushed later (src/lib/overrides.ts), and the "What changed" summary each one replans into. Every
// piece reads the model, so the tree, the roadmap and the Courses list share one set of actions.

/** Where a course stands, for which actions make sense. */
export type CourseState = 'done' | 'now' | 'registered' | 'planned'

/** The term before this one, skipping Spring/Summer: a past term for a course the transcript didn't date. */
function termBefore(label: string): string {
  const [season, year] = [label.slice(0, label.lastIndexOf(' ')), Number(label.slice(label.lastIndexOf(' ') + 1))]
  return season === 'Winter' ? `Fall ${year - 1}` : `Winter ${year}`
}

/** A plan term label ("Winter 2028"), or null for "Year 2" and the like. */
const realTerm = (term: string | undefined) => (term && !Number.isNaN(termOrd(term)) ? term : null)

/** The planner's per-course warnings and errors, in plain words. */
export function CourseWarnings({ code }: { code: string }) {
  const m = useModel()
  const mine = m.planNotes.filter((d) => d.course === code && (d.level === 'warning' || d.level === 'error'))
  if (mine.length === 0) return null
  return (
    <ul className="changes__warnings">
      {mine.map((d, i) => (
        <li key={`${d.code}:${i}`} className={d.level === 'error' ? 'changes__warning changes__warning--error' : 'changes__warning'}>
          {warningText(d)}
        </li>
      ))}
    </ul>
  )
}

function warningText(d: Diagnostic): string {
  if (d.code === 'UNKNOWN_OFFERING') return 'Offering unconfirmed: no published section yet. Check the class search before you count on it.'
  if (d.code === 'AT_RISK') return 'At risk: no section in the last 3 years.'
  return d.message
}

/**
 * "Something changed?": I failed it / I withdrew for a course done or under way; Not running / Take it
 * later for one the plan put in a term. What's already been said about the course shows with an Undo.
 */
export function CourseChanges({ code, term, state, onDone }: { code: string; term?: string; state: CourseState; onDone?: () => void }) {
  const m = useModel()
  if (isElective(code)) return null
  const current = m.currentTermLabel
  const said = m.overrides.filter((o) => o.code === code)
  const statusSaid = said.some((o) => o.kind === 'failed' || o.kind === 'withdrew')
  const at = realTerm(term)
  const act = (kind: OverrideKind, when: string) => {
    m.addOverride({ code, kind, term: when })
    onDone?.()
  }

  const actions: { kind: OverrideKind; label: string; when: string }[] = []
  if (!statusSaid) {
    if (state === 'done') {
      const when = at && termOrd(at) <= termOrd(current) ? at : termBefore(current)
      actions.push({ kind: 'failed', label: 'I failed it', when }, { kind: 'withdrew', label: 'I withdrew', when })
    } else if (state === 'now') {
      const when = at && termOrd(at) <= termOrd(current) ? at : current
      actions.push({ kind: 'failed', label: 'I failed it', when }, { kind: 'withdrew', label: 'I withdrew', when })
    } else if (state === 'registered') {
      actions.push({ kind: 'withdrew', label: 'I dropped it', when: current })
    }
  }
  if ((state === 'planned' || state === 'registered') && at && termOrd(at) >= termOrd(current)) {
    if (!said.some((o) => o.kind === 'not-offered' && o.term === at)) actions.push({ kind: 'not-offered', label: `Not running in ${at}`, when: at })
    if (state === 'planned' && !said.some((o) => o.kind === 'later' && o.term === at)) actions.push({ kind: 'later', label: 'Take it later', when: at })
  }
  if (actions.length === 0 && said.length === 0) return null

  return (
    <section className="changes">
      <h3 className="changes__title">Something changed?</h3>
      {said.length > 0 && (
        <ul className="changes__said">
          {said.map((o) => (
            <li key={`${o.kind}:${o.term}`}>
              <span className="chip chip--quiet">{overrideLabel(o.kind, o.term)}</span>
              <button type="button" className="inline-link" onClick={() => m.removeOverride(o)}>
                Undo
              </button>
            </li>
          ))}
        </ul>
      )}
      {actions.length > 0 && (
        <div className="changes__actions">
          {actions.map((a) => (
            <Button key={a.kind} variant="secondary" className="changes__action" onClick={() => act(a.kind, a.when)}>
              {a.label}
            </Button>
          ))}
        </div>
      )}
    </section>
  )
}

const WHY: Record<PlanDiff['added'][number]['why'], string> = {
  retake: 'retake',
  prerequisite: 'prerequisite',
  alternative: 'instead',
  requirement: 'requirement',
  elective: 'elective',
}

/** The diff as short lines a student reads: "CMPT 434 moves Winter 2027 → Winter 2028 (needs CMPT 332)". */
function changeLines(diff: PlanDiff, override: CourseOverride, notes: Diagnostic[]): string[] {
  const causeOf = (course: string, given: string) => {
    if (given) return given
    if (course === override.code) return overrideCause(override.kind)
    const unbooked = notes.find((n) => n.code === 'UNBOOKED' && n.course === course)
    const needs = unbooked?.message.match(/it needs (.+?); the plan/)?.[1]
    return needs ? `needs ${needs}` : ''
  }
  const withCause = (text: string, cause: string) => (cause ? `${text} (${cause})` : text)
  const lines = [
    ...diff.moved.map((d) => withCause(`${courseCode(d.course)} moves ${d.from} → ${d.to}`, causeOf(d.course, d.cause))),
    ...diff.swapped.map((d) => withCause(`${d.group}: ${courseCode(d.from)} → ${courseCode(d.to)}`, d.cause)),
    ...diff.added.map((d) => withCause(`${courseCode(d.course)} added in ${d.to}`, causeOf(d.course, d.cause) || WHY[d.why])),
    ...diff.removed.map((d) => withCause(`${courseCode(d.course)} leaves ${d.from}`, causeOf(d.course, d.cause))),
  ]
  const { from, to } = diff.graduation
  if (from !== to) lines.push(`Graduation: ${from ?? 'nothing left'} → ${to ?? 'nothing left'}`)
  else if (to) lines.push(`Graduation stays ${to}`)
  return lines
}

const MAX_LINES = 8

/** After an override: what the replan moved, the planner's notes, and an Undo. Mounted once, in App. */
export function WhatChangedSheet() {
  const m = useModel()
  const change = m.lastChange
  const lines = change ? changeLines(change.diff, change.override, m.planNotes) : []
  const notes = change
    ? m.planNotes.filter((n) => n.course === change.override.code || n.code === 'UNBOOKED' || n.code === 'OVERRIDE_INVALID')
    : []
  return (
    <Sheet
      open={change !== null}
      onClose={m.dismissChange}
      title="What changed"
      footer={
        change ? (
          <div className="changes__footer">
            <Button variant="secondary" icon="restart" onClick={() => m.removeOverride(change.override)}>
              Undo
            </Button>
            <Button onClick={m.dismissChange}>Done</Button>
          </div>
        ) : null
      }
    >
      {change && (
        <div className="changes__summary">
          <p className="lead">
            {courseCode(change.override.code)} · {overrideLabel(change.override.kind, change.override.term)}
          </p>
          {lines.length > 0 ? (
            <ul className="changes__lines">
              {lines.slice(0, MAX_LINES).map((line) => (
                <li key={line}>{line}</li>
              ))}
              {lines.length > MAX_LINES && <li className="footnote">and {lines.length - MAX_LINES} more</li>}
            </ul>
          ) : (
            <p className="footnote">The plan didn&rsquo;t need to move anything.</p>
          )}
          {notes.length > 0 && (
            <ul className="changes__notes">
              {notes.map((n, i) => (
                <li key={`${n.code}:${n.course}:${i}`} className="footnote">
                  {n.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Sheet>
  )
}

/** Above a plan view: what the planner couldn't place, and a note when only the major is mapped. */
export function PlanIssues() {
  const m = useModel()
  const errors = m.planNotes.filter((d) => d.level === 'error')
  const unmapped = !m.activeDegree && m.plan.length > 0
  if (errors.length === 0 && !unmapped) return null
  return (
    <div className="changes__issues">
      {unmapped && <p className="footnote">This plan covers your major&rsquo;s requirements; add breadth and electives with an advisor.</p>}
      {errors.length > 0 && (
        <ul className="changes__warnings">
          {errors.map((d, i) => (
            <li key={`${d.code}:${d.course}:${i}`} className="changes__warning changes__warning--error">
              {d.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * Under an in-progress course on the Courses list: what was said about it (Failed, Withdrew,
 * Cancelled) with an Undo, and why the plan moved a registration the cascade un-booked. The actions
 * themselves live in the row's "..." menu.
 */
export function InProgressChanges({ code }: { code: string }) {
  const m = useModel()
  const said = m.overrides.filter((o) => o.code === code)
  const unbooked = m.planNotes.find((n) => n.code === 'UNBOOKED' && n.course === code)
  if (said.length === 0 && !unbooked) return null
  return (
    <span className="changes__row-actions">
      {said.map((o) => (
        <span key={`${o.kind}:${o.term}`} className="changes__row-said">
          <span className="chip chip--quiet">{overrideLabel(o.kind, o.term)}</span>
          <button type="button" className="inline-link" onClick={() => m.removeOverride(o)}>
            Undo
          </button>
        </span>
      ))}
      {unbooked && said.length === 0 && (
        <span className="changes__row-note">
          Needs {unbooked.message.match(/it needs (.+?); the plan/)?.[1] ?? 'a course you no longer have'}: the plan moves it. Check with the department.
        </span>
      )}
    </span>
  )
}
