import { useRef, useState } from 'react'
import { motion, useMotionValueEvent, useReducedMotion, useScroll, useTransform } from 'motion/react'
import { Wordmark } from '../../ui/Brand.tsx'
import { Button } from '../../ui/primitives.tsx'
import { ThemeSwitch } from '../../ui/ThemeSwitch.tsx'
import { CanopyBeat, GuideBeat, HowBeat, MoreBeat, ProblemBeat, RootsBeat, ScatteredBeat, ShowcaseBeat, TeamBeat } from './Beats.tsx'
import { Links, Wood, Zones } from './StoryTree.tsx'
import { useClimb } from './useClimb.ts'
import './landing.css'

interface LandingPageProps {
  /** Start the real onboarding wizard. */
  onGetStarted: () => void
  /** Bypass onboarding: straight to a sample student's courses, the fastest path for a demo. */
  onSkip: () => void
}

/**
 * The landing page is the pitch: StudyMax's Academic Skill Tree at the scale of the page. It opens
 * at the roots (the problem) and you scroll UP to climb: past a branch per beat of the story, arrows
 * carrying the signal from each beat to the next, a live mini skill tree, to the canopy (the payoff).
 * The presenter's clicker works too: Next and Previous move a beat at a time, Home and End jump to
 * the roots and the canopy.
 */
export function LandingPage({ onGetStarted, onSkip }: LandingPageProps) {
  const reduce = useReducedMotion() ?? false
  const stageRef = useRef<HTMLDivElement>(null)
  const climb = useClimb(stageRef, reduce)
  const { scrollY, scrollYProgress } = useScroll({ container: climb.scrollerRef })
  const pan = useTransform(scrollY, (y) => (reduce ? 0 : climb.panAt(y)))
  const climbed = useTransform(scrollYProgress, (p) => 1 - p)

  // The bar changes voice over the dusk sky, and shows its wordmark once you've left the roots.
  const [zone, setZone] = useState<'roots' | 'page' | 'dusk'>('roots')
  useMotionValueEvent(scrollY, 'change', (y) => {
    const scroller = climb.scrollerRef.current
    if (!scroller) return
    const max = scroller.scrollHeight - scroller.clientHeight
    setZone(y < climb.duskAt ? 'dusk' : y > max - scroller.clientHeight * 0.6 ? 'roots' : 'page')
  })

  const g = climb.geometry
  const props = { grown: climb.grown, live: climb.live }
  return (
    <div className={`landing landing--${zone}${g ? ' is-ready' : ''}${g?.compact ? ' landing--compact' : ''}`}>
      <div className="landing__bar-dock">
        <header className="landing__bar">
          <button type="button" className="landing__home" onClick={() => climb.go(0)} aria-label="StudyMax, back to the roots">
            <Wordmark height={26} className="landing__bar-wordmark" />
          </button>
          <div className="landing__bar-end">
            <ThemeSwitch />
            <Button className="landing__bar-cta" onClick={onGetStarted}>
              Get started
            </Button>
          </div>
        </header>
        <div className="landing__progress" aria-hidden>
          <motion.span style={{ scaleY: climbed }} />
        </div>
      </div>

      <div ref={stageRef} className="climb">
        {g && <Zones g={g} />}
        <motion.div className="climb__world" style={{ x: pan }}>
          {g && <Wood g={g} grown={climb.grown} reduce={reduce} />}
          {g && <Links g={g} grown={climb.grown} live={climb.live} />}
          <div className="climb__beats">
            <RootsBeat {...props} onGetStarted={onGetStarted} onSkip={onSkip} />
            <ProblemBeat {...props} />
            <ScatteredBeat {...props} />
            <GuideBeat {...props} />
            <HowBeat {...props} />
            <ShowcaseBeat {...props} />
            <MoreBeat {...props} />
            <TeamBeat {...props} />
            <CanopyBeat {...props} onGetStarted={onGetStarted} onSkip={onSkip} />
          </div>
        </motion.div>
      </div>
    </div>
  )
}
