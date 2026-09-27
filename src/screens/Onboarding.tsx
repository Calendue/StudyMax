import { useRef, type ReactNode } from 'react'
import { useModel } from '../model.ts'
import { courseCode } from '../format.ts'
import { ActionBar, ScreenBody, ScreenTitle, TopBar } from '../ui/chrome.tsx'
import { Icon } from '../ui/Icon.tsx'
import { Appear, Button, Group, IconButton, Row, RowIcon, SectionLabel } from '../ui/primitives.tsx'

const check = <Icon name="check" size={20} className="row__check" />

/** Where the student is in onboarding: one dot per question, the ones answered in Cherry Rose. */
function StepDots() {
  const m = useModel()
  if (m.stepIndex < 0) return null
  return (
    <span className="steps" role="img" aria-label={`Step ${m.stepIndex + 1} of ${m.stepCount}`}>
      {Array.from({ length: m.stepCount }, (_, i) => (
        <span key={i} className={`steps__dot${i <= m.stepIndex ? ' steps__dot--on' : ''}`} />
      ))}
    </span>
  )
}

/**
 * The frame every question shares: Back (Home on the first step, out to the landing page), the dots,
 * and the question. A single-select question advances the moment an option is clicked, so it has no
 * Continue button — only a multi-select or typed-in question needs one, since there's no single click
 * that means "done". `skip` adds a quiet way past an optional question.
 */
function Step({
  title,
  lead,
  canContinue = true,
  multiSelect = false,
  skip,
  children,
}: {
  title: ReactNode
  lead?: ReactNode
  canContinue?: boolean
  multiSelect?: boolean
  skip?: () => void
  children: ReactNode
}) {
  const m = useModel()
  return (
    <>
      <TopBar onBack={m.canGoBack ? m.back : m.toLanding} backLabel={m.canGoBack ? 'Back' : 'Home'} right={<StepDots />} />
      <ScreenBody>
        <ScreenTitle lead={lead}>{title}</ScreenTitle>
        {children}
      </ScreenBody>
      {multiSelect && (
        <ActionBar>
          <Button block disabled={!canContinue} onClick={m.next}>
            {m.nextIsReveal ? 'Reveal what my school hides' : 'Continue'}
          </Button>
          {skip && (
            <Button block variant="quiet" onClick={skip}>
              Skip for now
            </Button>
          )}
        </ActionBar>
      )}
    </>
  )
}

export function StudentScreen() {
  const m = useModel()
  const fileInput = useRef<HTMLInputElement>(null)
  // Coming back to this question after a transcript was read: say what it found.
  const transcriptStatus =
    m.uploadStatus === 'success'
      ? `Read: ${m.takenCourses.length} completed course${m.takenCourses.length === 1 ? '' : 's'} found.`
      : null
  return (
    <Step title="Are you just starting out?" lead="This decides whether we ask for your courses next." canContinue={m.studentType !== null}>
      <Group>
        <Row
          index={1}
          leading={<RowIcon name="plan" />}
          title="First-year student"
          subtitle="No courses yet. We'll build your path from scratch."
          selected={m.studentType === 'first-year'}
          trailing={m.studentType === 'first-year' ? check : null}
          onClick={() => m.chooseStudentType('first-year')}
        />
        <Row
          index={2}
          leading={<RowIcon name="upload" />}
          title="Existing student"
          subtitle={
            m.features.ai
              ? "You've got courses on the books. Upload a transcript or add them by hand."
              : "You've got courses on the books. Add them from the catalogue."
          }
          selected={m.studentType === 'existing'}
          trailing={m.studentType === 'existing' ? check : null}
          onClick={() => m.chooseStudentType('existing')}
        />
        <Row
          index={3}
          leading={<RowIcon name="upload" />}
          title="Upload my transcript"
          subtitle={
            transcriptStatus ??
            "A DegreeWorks audit or unofficial transcript, as a PDF. StudyMax reads every course on it."
          }
          onClick={() => fileInput.current?.click()}
        />
      </Group>
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

export function UniversityScreen() {
  const m = useModel()
  return (
    <Step
      title="Where do you study?"
      lead="StudyMax finds the specializations, certificates and awards your school spreads across dozens of pages."
      canContinue={m.universityId !== ''}
    >
      <Group>
        <Row
          index={1}
          leading={<RowIcon name="school" />}
          title="University of Saskatchewan"
          subtitle="Full plans for Computer Science, Applied Mathematics, Physics and Applied Computing"
          selected={m.universityId === 'usask'}
          trailing={m.universityId === 'usask' ? check : null}
          onClick={() => m.handleUniversityChange('usask')}
        />
        {/* Everything on the other-school path is AI guidance, so it needs the OpenAI key. */}
        {m.features.ai && (
          <Row
            index={2}
            leading={<RowIcon name="globe" />}
            title="Another university"
            subtitle="Scholarship direction for any school"
            selected={m.universityId === 'other'}
            trailing={m.universityId === 'other' ? check : null}
            onClick={() => m.handleUniversityChange('other')}
          />
        )}
      </Group>
    </Step>
  )
}

export function MajorScreen() {
  const m = useModel()
  return (
    <Step
      title="What's your major?"
      lead="The programs StudyMax can plan are first. Any other Arts & Science subject still gets its awards."
      canContinue={m.selectedProgram !== null}
    >
      <div className="field field--search">
        <Icon name="search" size={20} />
        <input
          type="search"
          enterKeyHint="search"
          value={m.programPickQuery}
          onChange={(e) => m.setProgramPickQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && m.programResults.length > 0) {
              e.preventDefault()
              m.handleProgramChange(m.programResults[0].id)
              e.currentTarget.blur()
            }
          }}
          placeholder="Computer science, psychology, PHYS…"
          aria-label="Search programs"
          autoComplete="off"
        />
      </div>
      {m.programResults.length === 0 ? (
        <p className="empty">No Arts &amp; Science program matches &ldquo;{m.programPickQuery}&rdquo;.</p>
      ) : (
        <Group>
          {m.programResults.map((option, i) => (
            <Row
              key={option.id}
              index={i}
              title={option.name}
              subtitle={option.hasData ? 'Full plan' : 'Awards only'}
              selected={option.id === m.programId}
              trailing={option.id === m.programId ? check : null}
              onClick={() => m.handleProgramChange(option.id)}
            />
          ))}
        </Group>
      )}
    </Step>
  )
}

export function MinorScreen() {
  const m = useModel()
  return (
    <Step title="Working on a minor?" lead="Optional. StudyMax finds any minor you're close to either way, declared or not.">
      <Group>
        <Row
          index={1}
          title="No minor, or not sure yet"
          selected={m.minorId === null}
          trailing={m.minorId === null ? check : null}
          onClick={() => m.chooseMinor(null)}
        />
        {m.minorOptions.map((minor, i) => (
          <Row
            key={minor.id}
            index={i + 2}
            title={minor.name}
            selected={m.minorId === minor.id}
            trailing={m.minorId === minor.id ? check : null}
            onClick={() => m.chooseMinor(minor.id)}
          />
        ))}
      </Group>
    </Step>
  )
}

export function ConcentrationScreen() {
  const m = useModel()
  const count = m.concentrationIds.length
  return (
    <Step
      title="Any specializations you're aiming for?"
      lead={`Optional. Pick as many as you're considering in ${m.selectedProgram?.name ?? 'your major'}; your plan is built around them.`}
      multiSelect
    >
      <Group>
        {m.concentrationOptions.map((spec, i) => {
          const on = m.concentrationIds.includes(spec.id)
          return (
            <Row
              key={spec.id}
              index={i + 1}
              title={spec.name}
              selected={on}
              trailing={<Icon name={on ? 'check' : 'plus'} size={20} className={on ? 'row__check' : 'row__add'} />}
              onClick={() => m.toggleConcentration(spec.id)}
            />
          )
        })}
      </Group>
      {count > 0 && <p className="footnote">{count === 1 ? 'One target' : `${count} targets`} picked. You can change them on the plan later.</p>}
    </Step>
  )
}

export function GraduationScreen() {
  const m = useModel()
  const thisYear = m.today.getFullYear()
  const years = Array.from({ length: 7 }, (_, i) => thisYear + i)
  return (
    <Step title="Expected year of graduation" canContinue={m.gradYear !== null}>
      <Group>
        {years.map((year, i) => (
          <Row
            key={year}
            index={i + 1}
            title={String(year)}
            selected={m.gradYear === year}
            trailing={m.gradYear === year ? check : null}
            onClick={() => m.chooseGradYear(year)}
          />
        ))}
      </Group>
    </Step>
  )
}

export function RegisteredScreen() {
  const m = useModel()
  const count = m.registered.length
  const query = m.registeredQuery.trim()
  return (
    <Step
      title="What courses have you registered for?"
      lead="Search by subject or code and tick every course you're taking. Your plan counts them as underway."
      multiSelect
    >
      <div className="field field--search">
        <Icon name="search" size={20} />
        <input
          type="search"
          enterKeyHint="search"
          value={m.registeredQuery}
          onChange={(e) => m.setRegisteredQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              // An exact code ("CMPT 214") is the top hit: Enter ticks it, if it isn't already.
              const top = m.registeredResults[0]
              if (top && !m.registered.includes(top.code)) m.toggleRegistered(top.code)
            }
          }}
          placeholder="CMPT 214, GEOG 120, PHYS 117…"
          aria-label="Search courses"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
        />
      </div>

      {query !== '' &&
        (m.registeredResults.length === 0 ? (
          <p className="empty">No USask course matches &ldquo;{query}&rdquo;.</p>
        ) : (
          <Group>
            {m.registeredResults.map((hit, i) => {
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

      {count > 0 && (
        <>
          <SectionLabel>
            Registered <span className="section-label__count tnum">{count}</span>
          </SectionLabel>
          <Group>
            {m.registered.map((code, i) => (
              <Row
                key={code}
                index={i}
                title={courseCode(code)}
                subtitle={m.courseTitle(code)}
                trailing={
                  <IconButton
                    icon="close"
                    label={`Remove ${courseCode(code)}`}
                    onClick={() => m.removeRegistered(code)}
                  />
                }
              />
            ))}
          </Group>
        </>
      )}
      {count === 0 && query === '' && (
        <p className="footnote">Optional. Skip it if you haven&rsquo;t registered yet.</p>
      )}

      <label className="check-option">
        <input type="checkbox" checked={m.springSummer} onChange={(e) => m.setSpringSummer(e.target.checked)} />
        <span>
          <span className="check-option__title">I want to take Spring/Summer classes</span>
          <span className="check-option__hint">Your plan adds a light Spring/Summer term between Winter and Fall.</span>
        </span>
      </label>
    </Step>
  )
}

export function PhoneScreen() {
  const m = useModel()
  const digits = m.phone.replace(/\D/g, '').length
  const canCall = digits >= 7
  return (
    <Step
      title="Enter your phone number"
      lead="So Max can call you and help you with your university roadmap and questions."
      canContinue={canCall}
      multiSelect
      skip={() => {
        m.setPhone('')
        m.next()
      }}
    >
      <Appear index={1} className="form">
        <div className="field">
          <input
            id="onboarding-phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            enterKeyHint="go"
            value={m.phone}
            onChange={(e) => m.setPhone(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && canCall) m.next()
            }}
            placeholder="+1 306 555 0123"
            aria-label="Your phone number"
          />
        </div>
        <p className="footnote">
          {m.account
            ? 'Saved to your account so Max can reach you. Max only calls when you ask.'
            : 'Max only calls when you ask. Your number isn\u2019t saved.'}
        </p>
      </Appear>
    </Step>
  )
}
