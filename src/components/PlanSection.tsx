import { useMemo, useState } from 'react'
import type { SpecializationMatch } from '../lib/match.ts'
import { buildStudentPlan, termsFrom, upcomingTerm, type Season, type TermStart } from '../lib/plan.ts'
import { catalogueUrl, courseCode } from '../lib/courseSearch.ts'

const ACCENTS = ['pear', 'cyan', 'mint'] as const
const START_TERM_CHOICES = 6

interface PlanSectionProps {
  /** The primary target — always in the plan, can't be removed here. */
  hero: SpecializationMatch
  /** Everything the student could plan toward: the program's specializations plus credentials. */
  candidates: SpecializationMatch[]
  completed: Set<string>
  /** Registered but ungraded — counted as done by the start term, never planned again. */
  inProgress: string[]
  programName: string
  courseLabel: (code: string) => string
  today: Date
}

const termKey = (t: TermStart) => `${t.season} ${t.year}`
function parseTermKey(key: string): TermStart {
  const [season, year] = key.split(' ')
  return { season: season as Season, year: Number(year) }
}

/** Term-by-term path to one or more targets, from the student's courses and chosen start term. */
export function PlanSection({ hero, candidates, completed, inProgress, programName, courseLabel, today }: PlanSectionProps) {
  const [coursesPerTerm, setCoursesPerTerm] = useState(2)
  const startChoices = useMemo(() => termsFrom(upcomingTerm(today), START_TERM_CHOICES), [today])
  const [start, setStart] = useState<TermStart>(startChoices[0])
  // Extra targets added to the same plan. An id that stops resolving (program switched) drops out.
  const [extraTargetIds, setExtraTargetIds] = useState<string[]>([])
  const [planCopied, setPlanCopied] = useState(false)
  // Clipboard writes are blocked in some browsers and contexts. Rather than a button that appears to
  // do nothing, the plan text is shown for the student to select by hand.
  const [planText, setPlanText] = useState<string | null>(null)

  const addableTargets = candidates.filter(
    (m) => m.remaining > 0 && m.spec.id !== hero.spec.id && !extraTargetIds.includes(m.spec.id),
  )
  const targets = useMemo(() => {
    const byId = new Map(candidates.map((m) => [m.spec.id, m]))
    return [hero, ...extraTargetIds.map((id) => byId.get(id)).filter((m) => m !== undefined)].filter(
      (m) => m.remaining > 0,
    )
  }, [hero, candidates, extraTargetIds])

  const plan = useMemo(
    () =>
      buildStudentPlan(
        targets.map((t) => t.spec),
        candidates.map((c) => c.spec),
        completed,
        inProgress,
        coursesPerTerm,
        start,
      ),
    [targets, candidates, completed, inProgress, coursesPerTerm, start],
  )

  const hiddenPrereqs = plan.flatMap((t) => t.courses).filter((c) => c.reason === 'prerequisite')
  const targetNames = targets.map((t) => t.spec.name).join(' + ')

  async function copyPlan() {
    const required = plan.flatMap((t) => t.courses).filter((c) => c.reason === 'requirement').length
    const lines = [
      `StudyMax plan — ${targetNames} (${programName})`,
      `${required} required course${required === 1 ? '' : 's'} outstanding` +
        (hiddenPrereqs.length > 0
          ? `, plus ${hiddenPrereqs.length} prerequisite${hiddenPrereqs.length === 1 ? '' : 's'} not listed on the specialization page`
          : '') +
        `. ${coursesPerTerm} per term, starting ${termKey(start)}.`,
      ...(inProgress.length > 0 ? [`Assumes ${inProgress.map(courseCode).join(', ')} (in progress) are passed.`] : []),
      '',
      ...plan.flatMap((term) => [
        `${term.label}:`,
        ...term.courses.map((c) => {
          const notes = [
            c.reason === 'prerequisite' ? `prerequisite for ${courseCode(c.neededBy ?? '')}` : null,
            c.alsoAdvances.length > 0 ? `also counts toward: ${c.alsoAdvances.join(', ')}` : null,
          ].filter(Boolean)
          return `  - ${courseLabel(c.code)}${notes.length > 0 ? ` (${notes.join('; ')})` : ''}`
        }),
      ]),
      '',
      'Prerequisites and sequencing from catalogue.usask.ca. Confirm course offerings by term with an advisor.',
    ]
    const text = lines.join('\n')
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      setPlanText(text)
      return
    }
    setPlanText(null)
    setPlanCopied(true)
    setTimeout(() => setPlanCopied(false), 2000)
  }

  if (plan.length === 0) return null

  return (
    <section className="section section--band plan" data-band="lavender">
      <div className="plan__head">
        <h2 className="section__title">Your path to {targetNames}</h2>
        <label className="plan__control">
          <span>Starting</span>
          <select
            className="resources__input"
            value={termKey(start)}
            onChange={(e) => setStart(parseTermKey(e.target.value))}
          >
            {startChoices.map((t) => (
              <option key={termKey(t)} value={termKey(t)}>
                {termKey(t)}
              </option>
            ))}
          </select>
        </label>
        <label className="plan__control">
          <span>Courses per term</span>
          <select
            className="resources__input"
            value={coursesPerTerm}
            onChange={(e) => setCoursesPerTerm(Number(e.target.value))}
          >
            {[1, 2, 3, 4].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="plan__targets">
        <div className="chips">
          {targets.map((t) => (
            <span key={t.spec.id} className="chip">
              {t.spec.name}
              {t.spec.id !== hero.spec.id && (
                <button
                  type="button"
                  className="chip__remove"
                  aria-label={`Remove ${t.spec.name} from this plan`}
                  onClick={() => setExtraTargetIds((ids) => ids.filter((id) => id !== t.spec.id))}
                >
                  ×
                </button>
              )}
            </span>
          ))}
        </div>
        {addableTargets.length > 0 && (
          <label className="plan__control">
            <span className="sr-only">Add another target to this plan</span>
            <select
              className="resources__input"
              value=""
              onChange={(e) => {
                const id = e.target.value
                if (id) setExtraTargetIds((ids) => [...ids, id])
              }}
            >
              <option value="">+ Add another one you&rsquo;re close to…</option>
              {addableTargets.map((m) => (
                <option key={m.spec.id} value={m.spec.id}>
                  {m.spec.name} — {m.remaining} left
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <p className="hint">
        Finishes in {plan.length} term{plan.length === 1 ? '' : 's'} — by{' '}
        <strong>{plan[plan.length - 1].label}</strong>. Where a requirement let you choose, we picked the option that
        also counts toward the most other credentials.
        {inProgress.length > 0 &&
          ` Your ${inProgress.length} in-progress course${inProgress.length === 1 ? ' is' : 's are'} counted as passed before ${termKey(start)}.`}
      </p>
      {hiddenPrereqs.length > 0 && (
        <p className="plan__hidden-cost">
          <strong>
            {hiddenPrereqs.length} course{hiddenPrereqs.length === 1 ? '' : 's'} below{' '}
            {hiddenPrereqs.length === 1 ? 'is' : 'are'} not on the specialization page
          </strong>{' '}
          — {hiddenPrereqs.length === 1 ? "it's a prerequisite" : "they're prerequisites"} you need before
          you&rsquo;re allowed to register for the ones that are. That&rsquo;s the real cost.
        </p>
      )}

      <ol className="plan__terms">
        {plan.map((term, i) => (
          <li key={term.label} className={`plan__term plan__term--${ACCENTS[i % ACCENTS.length]}`}>
            <p className="plan__term-label">{term.label}</p>
            <ul className="plan__courses">
              {term.courses.map((c) => (
                <li key={c.code} className={`plan__course plan__course--${c.reason}`}>
                  <a className="plan__course-name" href={catalogueUrl(c.code)} target="_blank" rel="noreferrer">
                    {courseLabel(c.code)}
                    <span className="external-mark" aria-hidden>
                      {' ↗'}
                    </span>
                    <span className="sr-only"> (opens the USask catalogue)</span>
                  </a>
                  {c.reason === 'prerequisite' && (
                    <span className="plan__prereq">
                      Prerequisite for {courseCode(c.neededBy ?? '')}
                      {c.prerequisiteText && (
                        <em className="plan__prereq-rule">
                          {courseCode(c.neededBy ?? '')} requires: {c.prerequisiteText}
                        </em>
                      )}
                    </span>
                  )}
                  {c.alsoAdvances.length > 0 && (
                    <span className="plan__double-dip">Also counts toward: {c.alsoAdvances.join(', ')}</span>
                  )}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>

      <div className="plan__actions">
        <button type="button" className="btn" onClick={copyPlan}>
          {planCopied ? '✓ Copied' : 'Copy plan for my advisor'}
        </button>
      </div>
      {planText !== null && (
        <>
          <p className="hint">Your browser blocked the copy — select the plan below and copy it yourself.</p>
          <textarea className="plan__fallback" readOnly rows={8} value={planText} />
        </>
      )}
      <p className="plan__caveat">
        Prerequisites come from catalogue.usask.ca verbatim; nothing here is inferred. What we can&rsquo;t know is
        which terms a course is actually offered in — confirm that with your advisor before you register.
      </p>
    </section>
  )
}
