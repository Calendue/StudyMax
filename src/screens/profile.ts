import type { Model, Screen } from '../App.tsx'

export interface ProfileRow {
  key: string
  label: string
  /** The answer, or null while it's still to come. */
  value: string | null
  /** A shorter form for the wizard's narrow panel, where it differs. */
  brief?: string
  /** What an optional step that was passed without an answer reads as. */
  empty: string
  /** The onboarding step that asks it: the review's Edit link. */
  step: Screen
  /** Whether this path asks it at all (another university skips degree, major, goals, this term). */
  shown: boolean
}

/** "Bachelor of Science (BSc)" → "BSc": what a student calls it. */
export function shortDegree(degree: string) {
  return degree.match(/\(([^)]+)\)/)?.[1] ?? degree
}

/**
 * What onboarding knows so far, one row per answer: the review lists it, and on a wide screen the
 * wizard's panel fills it in as the student answers.
 */
export function profileRows(m: Model): ProfileRow[] {
  const steps = m.onboardingSteps
  // A step counts as passed once the student is beyond it, or out of onboarding into the courses/reveal.
  const past = (step: Screen) => {
    const at = steps.indexOf(step)
    if (at < 0) return false
    if (m.stepIndex >= 0) return m.stepIndex > at
    return m.screen === 'courses' || m.screen === 'reveal' || m.screen === 'results' || (m.screen === 'reading' && m.readingFrom === 'courses')
  }
  const usask = m.universityId === 'usask'
  const goals = [
    ...m.concentrationIds.map((id) => m.concentrationOptions.find((s) => s.id === id)?.name).filter((n): n is string => !!n),
    ...(m.minorId ? [m.minorOptions.find((p) => p.id === m.minorId)?.name ?? 'A minor'] : []),
  ]
  const goalsValue = goals.length === 0 ? null : goals.length === 1 ? goals[0] : `${goals[0]} +${goals.length - 1} more`
  const term = m.registered.length
  const termValue =
    term > 0 ? `${term} course${term === 1 ? '' : 's'}${m.springSummer ? ', plus Spring/Summer' : ''}` : m.springSummer && past('registered') ? 'Spring/Summer on' : null

  return [
    {
      key: 'stage',
      label: 'Stage',
      value:
        m.studentType === 'first-year'
          ? 'First year'
          : m.studentType === 'existing'
            ? m.uploadStatus === 'success'
              ? 'Transcript read'
              : 'Taking courses'
            : null,
      empty: '',
      step: 'student',
      shown: true,
    },
    {
      key: 'school',
      label: 'School',
      value: usask ? 'University of Saskatchewan' : m.universityId === 'other' ? 'Another university' : null,
      brief: usask ? 'USask' : undefined,
      empty: '',
      step: 'university',
      shown: true,
    },
    { key: 'degree', label: 'Degree', value: m.degree ? shortDegree(m.degree) : null, empty: '', step: 'degree', shown: m.universityId !== 'other' },
    {
      key: 'major',
      label: 'Major',
      value: usask && m.programId ? (m.selectedProgram?.name ?? null) : null,
      empty: '',
      step: 'degree',
      shown: m.universityId !== 'other',
    },
    { key: 'grad', label: 'Graduating', value: m.gradYear ? String(m.gradYear) : null, empty: '', step: 'degree', shown: true },
    {
      key: 'goals',
      label: 'Aiming for',
      value: goalsValue ?? (past('goals') ? 'Open to anything' : null),
      empty: 'Open to anything',
      step: 'goals',
      shown: steps.includes('goals'),
    },
    {
      key: 'term',
      label: 'This term',
      value: termValue ?? (past('registered') ? 'Nothing yet' : null),
      empty: 'Nothing yet',
      step: 'registered',
      shown: steps.includes('registered'),
    },
  ]
}
