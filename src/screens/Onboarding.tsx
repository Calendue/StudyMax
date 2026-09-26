import type { ReactNode } from 'react'
import { useModel } from '../model.ts'
import { ActionBar, ScreenBody, ScreenTitle, TopBar } from '../ui/chrome.tsx'
import { Icon } from '../ui/Icon.tsx'
import { Appear, Button, Group, Row, RowIcon } from '../ui/primitives.tsx'

// Degrees across the Arts & Science programs StudyMax covers. Descriptive: it doesn't change what
// the matcher or the planner find.
const DEGREE_OPTIONS = [
  'Bachelor of Science (BSc)',
  'Bachelor of Science, Honours (BSc Honours)',
  'Bachelor of Arts (BA)',
  'Bachelor of Arts, Honours (BA Honours)',
]

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
 * The frame every question shares: Back, the dots, and the question. A single-select question
 * advances the moment an option is clicked, so it has no Continue button — only a multi-select
 * question (picking several specializations) needs one, since there's no single click that means
 * "done".
 */
function Step({
  title,
  lead,
  canContinue = true,
  multiSelect = false,
  children,
}: {
  title: ReactNode
  lead?: ReactNode
  canContinue?: boolean
  multiSelect?: boolean
  children: ReactNode
}) {
  const m = useModel()
  return (
    <>
      <TopBar onBack={m.canGoBack ? m.back : undefined} brand={!m.canGoBack} right={<StepDots />} />
      <ScreenBody>
        <ScreenTitle lead={lead}>{title}</ScreenTitle>
        {children}
      </ScreenBody>
      {multiSelect && (
        <ActionBar>
          <Button block disabled={!canContinue} onClick={m.next}>
            {m.nextIsReveal ? 'Reveal what my school hides' : 'Continue'}
          </Button>
        </ActionBar>
      )}
    </>
  )
}

export function StudentScreen() {
  const m = useModel()
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
      </Group>
      <Appear index={3} className="demo-link">
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

export function DegreeScreen() {
  const m = useModel()
  return (
    <Step title="What degree are you working toward?" canContinue={m.degree !== ''}>
      <Group>
        {DEGREE_OPTIONS.map((option, i) => (
          <Row
            key={option}
            index={i + 1}
            title={option}
            selected={m.degree === option}
            trailing={m.degree === option ? check : null}
            onClick={() => m.chooseDegree(option)}
          />
        ))}
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
