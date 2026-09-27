import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useModel } from '../model.ts'
import { plural } from '../format.ts'
import { Mark } from '../ui/Brand.tsx'
import { DUR, SPRING } from '../ui/motion.ts'
import { CountUp, Ring } from '../ui/primitives.tsx'
import { StatusLines, type StatusLine } from './StatusLines.tsx'

// The beat between adding courses and seeing results: the moment. A ring draws to how far along the
// student already is, counting up; the lines under it report the matcher's real results, paced so each
// can be read; then the credential it all points at lands, and the results take over with a haptic.
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
    const beat = reduce ? 0 : 520
    const timers = Array.from({ length: count }, (_, i) => setTimeout(() => setStep(i + 1), beat * (i + 0.5)))
    // The payoff holds long enough to read the credential's name.
    timers.push(setTimeout(() => finish.current(), reduce ? 0 : beat * count + 1200))
    return () => timers.forEach(clearTimeout)
  }, [count, reduce])

  const lines: StatusLine[] = all.slice(0, step).map((text, i) => ({
    text,
    state: i < step - 1 || step === all.length ? 'done' : 'active',
  }))

  if (!m.hasProgramData) {
    return (
      <main className="wait wait--reveal">
        <div className="wait__mark wait__mark--reveal" aria-hidden>
          <Mark size={72} />
        </div>
        <h1 className="wait__title">Finding your awards</h1>
        <StatusLines lines={lines} />
      </main>
    )
  }

  // Someone with courses sees how far along they are; a first-year sees how much was mapped for them.
  const started = m.hero.doneCount > 0 && m.hero.totalRequired > 0
  const pct = started ? Math.round((m.hero.doneCount / m.hero.totalRequired) * 100) : 0
  const landed = step >= count
  const draw = { duration: 1.5, delay: 0.3 }
  return (
    <main className="wait wait--reveal reveal">
      <p className="reveal__eyebrow">{m.completed.size > 0 ? <>Looking at what you&rsquo;ve taken</> : 'Mapping your path'}</p>
      <Ring
        done={started ? m.hero.doneCount : 1}
        total={started ? m.hero.totalRequired : 1}
        size={184}
        stroke={12}
        duration={draw.duration}
        delay={draw.delay}
        label={started ? `${pct}% of ${m.hero.spec.name} done` : `${specCount} specializations mapped`}
      >
        <span className="reveal__figure">
          <CountUp value={started ? pct : specCount} duration={draw.duration} delay={draw.delay} />
          {started && <span className="reveal__pct">%</span>}
        </span>
        <span className="reveal__unit">{started ? 'done already' : 'paths mapped'}</span>
      </Ring>
      <div className="reveal__payoff" aria-live="polite">
        <AnimatePresence>
          {landed && (
            <motion.div
              initial={{ opacity: 0, y: reduce ? 0 : 12, scale: reduce ? 1 : 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={reduce ? { duration: 0 } : { duration: DUR.slow, ease: SPRING }}
            >
              <span className="reveal__lead">{started ? 'of the way to' : 'Your path to'}</span>
              <h1 className="reveal__target">{m.hero.spec.name}</h1>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <StatusLines lines={lines} />
    </main>
  )
}
