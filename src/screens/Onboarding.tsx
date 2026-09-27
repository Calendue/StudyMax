import { useEffect, useRef, type ReactNode } from 'react'
import { MAX_COURSES_PER_TERM, MAX_SUMMER_COURSES } from '../lib/cloudSession.ts'
import { motion, useReducedMotion } from 'motion/react'
import { useModel } from '../model.ts'
import type { Screen } from '../App.tsx'
import { courseCode } from '../format.ts'
import { ActionBar, ScreenBody, ScreenTitle, TopBar } from '../ui/chrome.tsx'
import { Icon, type IconName } from '../ui/Icon.tsx'
import { useLayoutMode } from '../ui/layout.ts'
import { DUR, INSTANT, SETTLE, appearTransition } from '../ui/motion.ts'
import { Appear, Button, Group, Row } from '../ui/primitives.tsx'
import { profileRows } from './profile.ts'

/** The slim bar every step shares: how far through, never how many dots. */
export function StepProgress({ compact = false }: { compact?: boolean }) {
  const m = useModel()
  const reduce = useReducedMotion()
  if (m.stepIndex < 0) return null
  const at = m.stepIndex + 1
  const from = Math.min(Math.max(at - m.direction, 0), m.stepCount)
  return (
    <div
      className={`onb-progress${compact ? ' onb-progress--compact' : ''}`}
      role="progressbar"
      aria-label="Setup progress"
      aria-valuemin={1}
      aria-valuemax={m.stepCount}
      aria-valuenow={at}
    >
      {!compact && (
        <span className="onb-progress__text">
          Step {at} of {m.stepCount}
          {at === 1 && <span className="onb-progress__hint"> · about a minute</span>}
        </span>
      )}
      <span className="onb-progress__track">
        <motion.span
          className="onb-progress__fill"
          initial={compact ? { scaleX: from / m.stepCount } : false}
          animate={{ scaleX: at / m.stepCount }}
          transition={reduce ? INSTANT : { duration: DUR.slow, ease: SETTLE }}
        />
      </span>
    </div>
  )
}

/**
 * The frame every step shares. On a phone: Back and the count on top, a slim progress bar, and the
 * primary action anchored at the bottom. On a wide screen (inside the wizard, which draws the
 * progress): the question block centred, with Back as a quiet link and Continue at its bottom right.
 * Keyboard: arrows move between options, Enter continues, Esc goes back.
 */
function Step({
  title,
  lead,
  canContinue = true,
  continueLabel,
  children,
}: {
  title: ReactNode
  lead?: ReactNode
  canContinue?: boolean
  continueLabel?: string
  children: ReactNode
}) {
  const m = useModel()
  const wide = useLayoutMode() !== 'tabs'
  const goBack = m.canGoBack ? m.back : m.toLanding
  const backLabel = m.canGoBack ? 'Back' : 'Home'
  const label = continueLabel ?? 'Continue'

  const keys = useRef({ goBack, canContinue, next: m.next, sheet: m.sheet })
  keys.current = { goBack, canContinue, next: m.next, sheet: m.sheet }
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const k = keys.current
      if (k.sheet || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return
      const target = e.target as HTMLElement
      const typing = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA'
      if (e.key === 'Escape') {
        if (typing && (target as HTMLInputElement).value) return // Esc clears the field first
        e.preventDefault()
        k.goBack()
      } else if (e.key === 'Enter') {
        if (typing || target.closest('button, a, label')) return
        if (k.canContinue) {
          e.preventDefault()
          k.next()
        }
      } else if (e.key.startsWith('Arrow') && !typing) {
        const group = target.closest('[data-choices]')
        const items = [...(group ?? document).querySelectorAll<HTMLElement>('[data-choice]')]
        if (items.length === 0) return
        const at = items.indexOf(target.closest('[data-choice]') as HTMLElement)
        const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1
        e.preventDefault()
        items[at < 0 ? 0 : (at + step + items.length) % items.length].focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (wide) {
    return (
      <ScreenBody className="onb">
        <div className="onb__block">
          <ScreenTitle lead={lead}>{title}</ScreenTitle>
          {children}
          <div className="onb__foot">
            <button type="button" className="onb__back" onClick={goBack}>
              <Icon name="back" size={18} />
              {backLabel}
            </button>
            <Button disabled={!canContinue} onClick={m.next} className="onb__continue">
              {label}
              <Icon name="arrow" size={18} />
            </Button>
          </div>
          <p className="onb__keys" aria-hidden>
            <kbd>Enter</kbd> to continue · <kbd>Esc</kbd> to go back
          </p>
        </div>
      </ScreenBody>
    )
  }

  return (
    <>
      <TopBar
        onBack={goBack}
        backLabel={backLabel}
        right={
          <span className="onb__count tnum">
            {m.stepIndex + 1} of {m.stepCount}
          </span>
        }
      />
      <StepProgress compact />
      <ScreenBody className="onb">
        <ScreenTitle lead={lead}>{title}</ScreenTitle>
        {children}
      </ScreenBody>
      <ActionBar>
        <Button block disabled={!canContinue} onClick={m.next}>
          {label}
        </Button>
      </ActionBar>
    </>
  )
}

/** A large selectable card: icon, title, one line of help. */
function Choice({
  icon,
  title,
  help,
  selected = false,
  index = 0,
  wide,
  onClick,
}: {
  icon: IconName
  title: ReactNode
  help: ReactNode
  selected?: boolean
  index?: number
  wide?: boolean
  onClick: () => void
}) {
  const reduce = useReducedMotion()
  return (
    <motion.button
      type="button"
      data-choice
      role="radio"
      aria-checked={selected}
      className={`choice${selected ? ' choice--on' : ''}${wide ? ' choice--wide' : ''}`}
      onClick={onClick}
      initial={{ opacity: 0, y: reduce ? 0 : 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={appearTransition(index, reduce)}
    >
      <span className="choice__icon">
        <Icon name={icon} size={22} />
      </span>
      <span className="choice__body">
        <span className="choice__title">{title}</span>
        <span className="choice__help">{help}</span>
      </span>
      <span className="choice__check" aria-hidden>
        <Icon name="check" size={14} />
      </span>
    </motion.button>
  )
}

/** A compact selectable option, for short answers (a degree, a year, a specialization). */
function OptionChip({
  children,
  selected,
  multi,
  title,
  onClick,
}: {
  children: ReactNode
  selected: boolean
  multi?: boolean
  title?: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      data-choice
      role={multi ? 'checkbox' : 'radio'}
      aria-checked={selected}
      title={title}
      className={`opt-chip${selected ? ' opt-chip--on' : ''}`}
      onClick={onClick}
    >
      {selected && <Icon name="check" size={16} />}
      {children}
    </button>
  )
}

/** A labelled answer inside a step with more than one. */
function Field({ label, hint, children, index = 0 }: { label: string; hint?: ReactNode; children: ReactNode; index?: number }) {
  return (
    <Appear index={index} className="onb-field">
      <div className="onb-field__label">
        <span>{label}</span>
        {hint && <span className="onb-field__hint">{hint}</span>}
      </div>
      {children}
    </Appear>
  )
}

function PlanBadge({ full }: { full: boolean }) {
  return <span className={`plan-badge${full ? ' plan-badge--full' : ''}`}>{full ? 'Full plan' : 'Awards only'}</span>
}

// ─────────────────────────────────────────────────────────────── 1. where you are

export function StudentScreen() {
  const m = useModel()
  const fileInput = useRef<HTMLInputElement>(null)
  const reading = m.uploadStatus === 'success'
  return (
    <Step
      title="Let's map your degree"
      lead="A few quick answers and StudyMax shows what you're closest to finishing. Change anything later."
      canContinue={m.studentType !== null}
    >
      <div className="choices choices--2" role="radiogroup" aria-label="Where you are" data-choices>
        <Choice
          index={0}
          icon="spark"
          title="Just starting"
          help="First year, no courses yet. We'll plan from day one."
          selected={m.studentType === 'first-year'}
          onClick={() => m.chooseStudentType('first-year')}
        />
        <Choice
          index={1}
          icon="layers"
          title="Taking courses"
          help={m.features.ai ? 'Add them from a transcript or the catalogue.' : 'Add them from the catalogue.'}
          selected={m.studentType === 'existing' && !reading}
          onClick={() => m.chooseStudentType('existing')}
        />
        {/* Reading a transcript is the AI's job, so the shortcut needs the OpenAI key. */}
        {m.features.ai && (
          <Choice
            index={2}
            wide
            icon="upload"
            title={reading ? 'Transcript read' : 'Upload my transcript'}
            help={
              reading
                ? `${m.takenCourses.length} completed course${m.takenCourses.length === 1 ? '' : 's'} found. Pick another PDF to replace it.`
                : 'The fastest way in: a DegreeWorks audit or unofficial transcript, as a PDF.'
            }
            selected={reading}
            onClick={() => fileInput.current?.click()}
          />
        )}
      </div>
      <input
        ref={fileInput}
        type="file"
        accept="application/pdf"
        className="visually-hidden"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = '' // allow picking the same filename again
          if (file) m.chooseTranscript(file)
        }}
      />
      {m.uploadStatus === 'error' && m.uploadError && (
        <Appear index={0} className="notice">
          <p>{m.uploadError}</p>
        </Appear>
      )}
      <Appear index={4} className="demo-link">
        <p>Just looking around?</p>
        <button type="button" className="inline-link" onClick={m.loadSampleStudent}>
          Load a sample student
        </button>
      </Appear>
    </Step>
  )
}

// ─────────────────────────────────────────────────────────────── 2. school

export function UniversityScreen() {
  const m = useModel()
  return (
    <Step
      title="Where do you study?"
      lead="StudyMax gathers the specializations, certificates and awards your school spreads across dozens of pages."
      canContinue={m.universityId !== ''}
    >
      <div className="choices" role="radiogroup" aria-label="Your university" data-choices>
        <Choice
          index={0}
          icon="school"
          title="University of Saskatchewan"
          help="Full plans for Computer Science and more, plus every award."
          selected={m.universityId === 'usask'}
          onClick={() => m.handleUniversityChange('usask')}
        />
        {/* Everything on the other-school path is AI guidance, so it needs the OpenAI key. */}
        {m.features.ai && (
          <Choice
            index={1}
            icon="globe"
            title="Another university"
            help="Scholarship direction for any school."
            selected={m.universityId === 'other'}
            onClick={() => m.handleUniversityChange('other')}
          />
        )}
      </div>
    </Step>
  )
}

// ─────────────────────────────────────────────────────────────── 3. degree, major, graduation

// The programs students pick most, first; the rest of the planned ones follow alphabetically.
const POPULAR = ['computer-science', 'biology', 'psychology', 'commerce', 'engineering', 'applied-mathematics', 'physics', 'nursing']
const popularRank = (id: string) => (POPULAR.includes(id) ? POPULAR.indexOf(id) : POPULAR.length)

function MajorPicker() {
  const m = useModel()
  const query = m.programPickQuery.trim()
  const popular = query
    ? []
    : m.programResults
        .filter((o) => o.hasData)
        .sort((a, b) => popularRank(a.id) - popularRank(b.id))
        .slice(0, 8)
  const chosen = m.programId ? m.programResults.find((o) => o.id === m.programId) : undefined
  const chosenName = m.programId ? m.selectedProgram?.name : undefined
  return (
    <>
      <div className="field field--search">
        <Icon name="search" size={20} />
        <input
          type="search"
          enterKeyHint="search"
          value={m.programPickQuery}
          onChange={(e) => m.setProgramPickQuery(e.target.value)}
          onFocus={(e) => {
            // On a phone the keyboard takes the bottom half: keep the field and its first hits above it.
            const field = e.currentTarget
            if (window.innerWidth < 768) setTimeout(() => field.scrollIntoView({ block: 'start', behavior: 'smooth' }), 300)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && m.programResults.length > 0 && query) {
              e.preventDefault()
              m.handleProgramChange(m.programResults[0].id)
              m.setProgramPickQuery('')
              e.currentTarget.blur()
            }
          }}
          placeholder="Search: computer science, psychology, PHYS…"
          aria-label="Search programs"
          autoComplete="off"
        />
      </div>
      {query ? (
        m.programResults.length === 0 ? (
          <p className="empty">No Arts &amp; Science program matches &ldquo;{query}&rdquo;.</p>
        ) : (
          <Group className="onb-results">
            {m.programResults.slice(0, 6).map((option, i) => (
              <Row
                key={option.id}
                index={i}
                title={option.name}
                selected={option.id === m.programId}
                trailing={
                  <>
                    <PlanBadge full={option.hasData} />
                    {option.id === m.programId && <Icon name="check" size={18} className="row__check" />}
                  </>
                }
                onClick={() => {
                  m.handleProgramChange(option.id)
                  m.setProgramPickQuery('')
                }}
              />
            ))}
          </Group>
        )
      ) : (
        <>
          {chosenName && !popular.some((o) => o.id === m.programId) && (
            <div className="opt-chips">
              <OptionChip selected onClick={() => {}}>
                {chosenName}
              </OptionChip>
              {chosen && <PlanBadge full={chosen.hasData} />}
            </div>
          )}
          <div className="opt-chips" role="radiogroup" aria-label="Popular majors" data-choices>
            {popular.map((o) => (
              <OptionChip key={o.id} selected={o.id === m.programId} onClick={() => m.handleProgramChange(o.id)}>
                {o.name}
              </OptionChip>
            ))}
          </div>
          <p className="onb-field__note">
            {popular.length > 0 ? 'These get a full term-by-term plan. ' : ''}Any other Arts &amp; Science subject gets its awards.
          </p>
        </>
      )}
    </>
  )
}

export function DegreeScreen() {
  const m = useModel()
  const other = m.universityId === 'other'
  const thisYear = m.today.getFullYear()
  const years = Array.from({ length: 7 }, (_, i) => thisYear + i)
  const valid = other ? m.gradYear !== null : m.selectedProgram !== null && m.programId !== '' && m.gradYear !== null
  // A transcript read on the first question usually names the major: it arrives picked, to confirm.
  const fromTranscript = !other && m.uploadStatus === 'success' && !m.onboardingSteps.includes('registered')
  return (
    <Step
      title={other ? 'When do you finish?' : 'Your degree'}
      lead={
        other
          ? 'Awards often depend on your year, so this shapes what we look for.'
          : fromTranscript && m.selectedProgram
            ? 'Your major came from your transcript. Add when you expect to graduate.'
            : 'Two quick picks. Your major decides how much StudyMax can plan.'
      }
      canContinue={valid}
    >
      {!other && (
        <Field label="Major" index={0}>
          <MajorPicker />
        </Field>
      )}
      <Field label="Expected graduation" index={1}>
        <div className="opt-chips" role="radiogroup" aria-label="Expected graduation" data-choices>
          {years.map((year) => (
            <OptionChip key={year} selected={m.gradYear === year} onClick={() => m.chooseGradYear(year)}>
              <span className="tnum">{year}</span>
            </OptionChip>
          ))}
        </div>
      </Field>
    </Step>
  )
}

// ─────────────────────────────────────────────────────────────── 4. goals (optional)

export function GoalsScreen() {
  const m = useModel()
  const count = m.concentrationIds.length + (m.minorId ? 1 : 0)
  return (
    <Step
      title="Anything else you're aiming for?"
      lead="Optional. Your plan is built around what you pick, and StudyMax still spots any minor you're close to."
      continueLabel={count > 0 ? 'Continue' : 'Skip'}
    >
      {m.concentrationOptions.length > 0 && (
        <Field label={`Specializations in ${m.selectedProgram?.name ?? 'your major'}`} hint="Pick any" index={0}>
          <div className="opt-chips" role="group" aria-label="Specializations" data-choices>
            {m.concentrationOptions.map((spec) => (
              <OptionChip key={spec.id} multi selected={m.concentrationIds.includes(spec.id)} onClick={() => m.toggleConcentration(spec.id)}>
                {spec.name}
              </OptionChip>
            ))}
          </div>
        </Field>
      )}
      {m.minorOptions.length > 0 && (
        <Field label="A minor" hint="Pick one" index={1}>
          <div className="opt-chips" role="radiogroup" aria-label="Minor" data-choices>
            <OptionChip selected={m.minorId === null} onClick={() => m.chooseMinor(null)}>
              No minor
            </OptionChip>
            {m.minorOptions.map((minor) => (
              <OptionChip key={minor.id} selected={m.minorId === minor.id} onClick={() => m.chooseMinor(minor.id)}>
                {minor.name}
              </OptionChip>
            ))}
          </div>
        </Field>
      )}
    </Step>
  )
}

// ─────────────────────────────────────────────────────────────── 5. this term (optional)

export function RegisteredScreen() {
  const m = useModel()
  const count = m.registered.length
  const query = m.registeredQuery.trim()
  return (
    <Step
      title="Taking anything this term?"
      lead="Optional. Courses you're registered in count as underway, so your plan builds on them."
      continueLabel={count > 0 ? 'Continue' : 'Skip'}
    >
      <div className="field field--search">
        <Icon name="search" size={20} />
        <input
          type="search"
          enterKeyHint="search"
          value={m.registeredQuery}
          onChange={(e) => m.setRegisteredQuery(e.target.value)}
          onFocus={(e) => {
            const field = e.currentTarget
            if (window.innerWidth < 768) setTimeout(() => field.scrollIntoView({ block: 'start', behavior: 'smooth' }), 300)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              // An exact code ("CMPT 214") is the top hit: Enter ticks it, if it isn't already.
              const top = m.registeredResults[0]
              if (top && !m.registered.includes(top.code)) m.toggleRegistered(top.code)
            }
          }}
          placeholder="Search: CMPT 214, GEOG 120, PHYS 117…"
          aria-label="Search courses"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
        />
      </div>

      {count > 0 && (
        <div className="opt-chips onb-picked" aria-label="Registered courses">
          {m.registered.map((code) => (
            <button
              key={code}
              type="button"
              className="opt-chip opt-chip--on"
              aria-label={`Remove ${courseCode(code)}`}
              onClick={() => m.removeRegistered(code)}
            >
              {courseCode(code)}
              <Icon name="close" size={14} />
            </button>
          ))}
        </div>
      )}

      {query !== '' &&
        (m.registeredResults.length === 0 ? (
          <p className="empty">No USask course matches &ldquo;{query}&rdquo;.</p>
        ) : (
          <Group className="onb-results">
            {m.registeredResults.slice(0, 30).map((hit, i) => {
              const on = m.registered.includes(hit.code)
              return (
                <Row
                  key={hit.code}
                  index={Math.min(i, 8)}
                  title={courseCode(hit.code)}
                  subtitle={hit.title}
                  selected={on}
                  trailing={<Icon name={on ? 'check' : 'plus'} size={20} className={on ? 'row__check' : 'row__add'} />}
                  onClick={() => m.toggleRegistered(hit.code)}
                />
              )
            })}
          </Group>
        ))}

      <button
        type="button"
        role="switch"
        aria-checked={m.springSummer}
        className={`toggle-card${m.springSummer ? ' toggle-card--on' : ''}`}
        onClick={() => m.setSpringSummer(!m.springSummer)}
      >
        <span className="toggle-card__body">
          <span className="toggle-card__title">Spring and Summer classes</span>
          <span className="toggle-card__help">Adds a light Spring/Summer term between Winter and Fall.</span>
        </span>
        <span className="toggle-card__switch" aria-hidden>
          <span />
        </span>
      </button>

      <Field label="Classes per term" hint="Fall and Winter" index={2}>
        <div className="opt-chips" role="radiogroup" aria-label="Classes per term" data-choices>
          {Array.from({ length: MAX_COURSES_PER_TERM }, (_, i) => i + 1).map((n) => (
            <OptionChip key={n} selected={m.coursesPerTerm === n} onClick={() => m.setCoursesPerTerm(n)}>
              <span className="tnum">{n}</span>
            </OptionChip>
          ))}
        </div>
      </Field>
      {m.springSummer && (
        <Field label="Spring/Summer classes" hint="Most per term" index={3}>
          <div className="opt-chips" role="radiogroup" aria-label="Spring/Summer classes" data-choices>
            {Array.from({ length: MAX_SUMMER_COURSES }, (_, i) => i + 1).map((n) => (
              <OptionChip key={n} selected={m.summerPerTerm === n} onClick={() => m.setSummerPerTerm(n)}>
                <span className="tnum">{n}</span>
              </OptionChip>
            ))}
          </div>
        </Field>
      )}
    </Step>
  )
}

// ─────────────────────────────────────────────────────────────── 6. review

export function ReviewScreen() {
  const m = useModel()
  const digits = m.phone.replace(/\D/g, '').length
  const phoneOk = digits === 0 || digits >= 7
  const rows = profileRows(m).filter((r) => r.shown)
  return (
    <Step
      title="Ready when you are"
      lead="Check your answers, then StudyMax maps your path."
      canContinue={phoneOk}
      continueLabel={m.nextIsReveal ? 'Reveal my path' : 'Next: your courses'}
    >
      <Appear index={0} className="review">
        {rows.map((row) => (
          <div key={row.key} className="review__row">
            <span className="review__label">{row.label}</span>
            <span className={`review__value${row.value ? '' : ' review__value--empty'}`}>{row.value ?? row.empty}</span>
            <button type="button" className="review__edit" onClick={() => m.editStep(row.step as Screen)} aria-label={`Edit ${row.label.toLowerCase()}`}>
              Edit
            </button>
          </div>
        ))}
      </Appear>
      {m.features.call && (
        <Field label="Want a call before an award closes?" hint="Optional" index={1}>
          <div className="field">
            <Icon name="phone" size={20} className="field__icon" />
            <input
              id="onboarding-phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              enterKeyHint="go"
              value={m.phone}
              onChange={(e) => m.setPhone(e.target.value)}
              onFocus={(e) => {
                const field = e.currentTarget
                if (window.innerWidth < 768) setTimeout(() => field.scrollIntoView({ block: 'center', behavior: 'smooth' }), 300)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && phoneOk) m.next()
              }}
              placeholder="+1 306 555 0123"
              aria-label="Your phone number"
            />
          </div>
          <p className="onb-field__note">
            {m.account
              ? 'Saved to your account so Max can reach you. Max calls only when you ask, about the award closing soonest.'
              : 'Max calls only when you ask, about the award closing soonest. Your number isn’t saved.'}
          </p>
        </Field>
      )}
    </Step>
  )
}

