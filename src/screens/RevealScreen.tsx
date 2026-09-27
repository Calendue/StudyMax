import { useEffect, useRef, useState } from 'react'
import { useReducedMotion } from 'motion/react'
import { useModel } from '../model.ts'
import { plural } from '../format.ts'
import { Mark } from '../ui/Brand.tsx'
import { StatusLines, type StatusLine } from './StatusLines.tsx'

// The beat between adding courses and seeing results. The matching itself is instant, so these lines
// report its real results, paced so each can be read, then hand over to the results with a haptic.
export function RevealScreen() {
  const m = useModel()
  const reduce = useReducedMotion()
  const [step, setStep] = useState(0)
  const finish = useRef(m.finishReveal)
  finish.current = m.finishReveal

  const specCount = m.selectedProgram?.specializations.length ?? 0
  const all: string[] = m.hasProgramData
    ? [
        m.completed.size > 0
          ? `Checked ${plural(m.completed.size, 'course')} against ${plural(specCount, 'specialization')}`
          : `Mapped ${plural(specCount, 'specialization')} in ${m.selectedProgram?.name ?? 'your program'}`,
        m.credentials.length > 0
          ? `Found ${plural(m.credentials.length, 'certificate or minor', 'certificates and minors')} you've already started`
          : 'Looked for certificates and minors you have already started',
        m.plan.length > 0
          ? `Planned the fastest path to ${m.hero.spec.name}`
          : m.targets.length > 0
            ? `Everything left for ${m.hero.spec.name} is in progress now`
            : `You've finished ${m.hero.spec.name}`,
        `Ranked ${plural(m.rankedAwards.length, 'award')} by deadline`,
      ]
    : [
        m.universityId === 'other'
          ? 'Getting scholarship direction ready for your school'
          : `${m.selectedProgram?.name ?? 'Your program'} has no requirement data yet, so we'll start with money`,
        m.universityId === 'other' ? 'Ready when you tell us your school' : `Ranked ${plural(m.rankedAwards.length, 'award')} by deadline`,
      ]

  const count = all.length
  useEffect(() => {
    // Runs once per visit; the lines themselves are read fresh at each render.
    const beat = reduce ? 0 : 480
    const timers = Array.from({ length: count }, (_, i) => setTimeout(() => setStep(i + 1), beat * (i + 0.5)))
    timers.push(setTimeout(() => finish.current(), reduce ? 0 : beat * count + 420))
    return () => timers.forEach(clearTimeout)
  }, [count, reduce])

  const lines: StatusLine[] = all.slice(0, step).map((text, i) => ({
    text,
    state: i < step - 1 || step === all.length ? 'done' : 'active',
  }))

  return (
    <main className="wait wait--reveal">
      <div className="wait__mark wait__mark--reveal" aria-hidden>
        <Mark size={72} />
      </div>
      <h1 className="wait__title">{m.completed.size > 0 ? <>Looking at what you&rsquo;ve taken</> : 'Mapping your path'}</h1>
      <StatusLines lines={lines} />
    </main>
  )
}
