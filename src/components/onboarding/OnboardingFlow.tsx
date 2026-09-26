import { useMemo, useState } from 'react'
import { usask } from '../../data/schools/usask.ts'
import type { AuthUser } from '../../lib/auth.ts'
import type { OnboardingProfile, StudentType } from './types.ts'
import { SignInStep } from './steps/SignInStep.tsx'
import { StudentTypeStep } from './steps/StudentTypeStep.tsx'
import { UniversityStep } from './steps/UniversityStep.tsx'
import { DegreeStep } from './steps/DegreeStep.tsx'
import { MajorStep } from './steps/MajorStep.tsx'
import { MinorStep } from './steps/MinorStep.tsx'
import { ConcentrationStep } from './steps/ConcentrationStep.tsx'
import './onboarding.css'

interface OnboardingFlowProps {
  onComplete: (profile: OnboardingProfile, user: AuthUser | null) => void
  onSkip: () => void
}

const STEP_ORDER = ['sign-in', 'student-type', 'university', 'degree', 'major', 'minor', 'concentration'] as const
type Step = (typeof STEP_ORDER)[number]

export function OnboardingFlow({ onComplete, onSkip }: OnboardingFlowProps) {
  const [stepIndex, setStepIndex] = useState(0)
  const [user, setUser] = useState<AuthUser | null>(null)
  const [studentType, setStudentType] = useState<StudentType | null>(null)
  const [universityChosen, setUniversityChosen] = useState(false)
  const [degree, setDegree] = useState('')
  const [majorProgramId, setMajorProgramId] = useState('')
  const [minorProgramId, setMinorProgramId] = useState<string | null>(null)
  const [concentrationIds, setConcentrationIds] = useState<string[]>([])

  const usaskPrograms = useMemo(() => usask.programs ?? [], [])
  const majors = useMemo(
    () =>
      usaskPrograms
        .filter((p) => p.kind !== 'certificate' && p.kind !== 'minor')
        .map((p) => ({ id: p.id, name: p.name, hasData: p.specializations.length > 0 })),
    [usaskPrograms],
  )
  const minors = useMemo(
    () => usaskPrograms.filter((p) => p.kind === 'minor').map((p) => ({ id: p.id, name: p.name })),
    [usaskPrograms],
  )
  const selectedMajor = useMemo(
    () => usaskPrograms.find((p) => p.id === majorProgramId) ?? null,
    [usaskPrograms, majorProgramId],
  )
  const concentrationOptions = useMemo(
    () => (selectedMajor?.specializations ?? []).map((s) => ({ id: s.id, name: s.name })),
    [selectedMajor],
  )

  // The concentration step only exists when the chosen major actually has specializations to pick
  // from (e.g. Computer Science's 12) — skipped entirely for a major with no data yet.
  const steps: Step[] = useMemo(
    () => STEP_ORDER.filter((s) => s !== 'concentration' || concentrationOptions.length > 0),
    [concentrationOptions],
  )
  const step = steps[stepIndex] ?? steps[steps.length - 1]

  function finish(finalUser: AuthUser | null) {
    onComplete(
      {
        studentType: studentType ?? 'existing',
        universityId: 'usask',
        degree,
        majorProgramId,
        minorProgramId,
        concentrationIds,
      },
      finalUser,
    )
  }

  function next() {
    if (stepIndex < steps.length - 1) setStepIndex(stepIndex + 1)
    else finish(user)
  }
  function back() {
    if (stepIndex > 0) setStepIndex(stepIndex - 1)
  }

  const canAdvance =
    step === 'student-type'
      ? studentType !== null
      : step === 'university'
        ? universityChosen
        : step === 'degree'
          ? degree !== ''
          : step === 'major'
            ? majorProgramId !== ''
            : true // minor and concentration are both optional

  return (
    <div className="onboarding">
      <div className="onboarding__shell">
        <span className="nav__mark onboarding__mark">
          <span className="nav__dot" aria-hidden />
          StudyMax
        </span>

        <div className="onboarding__progress" aria-hidden="true">
          {steps.map((s, i) => (
            <span key={s} className={`onboarding__dot ${i <= stepIndex ? 'onboarding__dot--done' : ''}`} />
          ))}
        </div>

        {step === 'sign-in' && (
          <SignInStep
            onSignedIn={(signedInUser) => {
              setUser(signedInUser)
              setStepIndex(1)
            }}
            onGuest={() => setStepIndex(1)}
          />
        )}
        {step === 'student-type' && <StudentTypeStep value={studentType} onChange={setStudentType} />}
        {step === 'university' && <UniversityStep chosen={universityChosen} onChoose={() => setUniversityChosen(true)} />}
        {step === 'degree' && <DegreeStep value={degree} onChange={setDegree} />}
        {step === 'major' && <MajorStep majors={majors} value={majorProgramId} onChange={setMajorProgramId} />}
        {step === 'minor' && <MinorStep minors={minors} value={minorProgramId} onChange={setMinorProgramId} />}
        {step === 'concentration' && (
          <ConcentrationStep
            options={concentrationOptions}
            selected={concentrationIds}
            onToggle={(id) =>
              setConcentrationIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
            }
          />
        )}

        {step !== 'sign-in' && (
          <div className="onboarding__actions">
            <button type="button" className="linkish" onClick={back}>
              Back
            </button>
            <button type="button" className="btn" disabled={!canAdvance} onClick={next}>
              {stepIndex === steps.length - 1 ? 'Finish' : 'Continue'}
            </button>
          </div>
        )}

        <button type="button" className="linkish onboarding__skip" onClick={onSkip}>
          Skip onboarding, just let me in
        </button>
      </div>
    </div>
  )
}
