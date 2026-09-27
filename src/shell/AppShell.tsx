import type { ComponentType, ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useModel } from '../model.ts'
import { Mark, Wordmark } from '../ui/Brand.tsx'
import { DUR, INSTANT, SETTLE } from '../ui/motion.ts'
import type { LayoutMode } from '../ui/layout.ts'
import { TopBar } from '../ui/chrome.tsx'
import { CallScreen } from '../screens/CallScreen.tsx'
import { PingMaxScreen } from '../screens/PingMaxScreen.tsx'
import { DashboardPage } from '../pages/DashboardPage.tsx'
import { PlanPage } from '../pages/PlanPage.tsx'
import { AwardsPage } from '../pages/AwardsPage.tsx'
import { ClassesPage } from '../pages/ClassesPage.tsx'
import { CoursesPage } from '../pages/CoursesPage.tsx'
import { Header } from './Header.tsx'
import { Rail, Sidebar } from './Sidebar.tsx'
import './shell.css'

/** The call is a focused moment: its own column inside the shell, with its own Back. */
function CallPage() {
  return (
    <div className="shell-focus">
      <CallScreen />
    </div>
  )
}

/** Same idea as CallPage, for Max's call (docs/BayMax/implementation/06-vapi-voice-integration.md). */
function PingMaxPage() {
  return (
    <div className="shell-focus">
      <PingMaxScreen />
    </div>
  )
}

const PAGES: Record<string, ComponentType> = {
  overview: DashboardPage,
  plan: PlanPage,
  awards: AwardsPage,
  classes: ClassesPage,
  courses: CoursesPage,
  call: CallPage,
  'ping-max': PingMaxPage,
}

/**
 * The app on a tablet or a desktop once there are results: the leading navigation (a rail, or the
 * full sidebar), the header, and one page at a time. It reads the same screen and tab as the phone,
 * so resizing the window never loses your place.
 */
export function AppShell({ mode }: { mode: Exclude<LayoutMode, 'tabs'> }) {
  const m = useModel()
  const reduce = useReducedMotion()
  const page = m.screen === 'courses' ? 'courses' : m.screen === 'call' ? 'call' : m.screen === 'ping-max' ? 'ping-max' : m.tab
  const Page = PAGES[page] ?? DashboardPage
  return (
    <div className={`shell shell--${mode}`}>
      {mode === 'sidebar' ? <Sidebar /> : <Rail />}
      <div className="shell__main">
        <Header />
        <AnimatePresence mode="wait" initial={false}>
          <motion.main
            key={page}
            className="shell__page"
            initial={reduce ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0, transition: reduce ? INSTANT : { duration: DUR.med, ease: SETTLE } }}
            exit={{ opacity: 0, transition: reduce ? INSTANT : { duration: DUR.fast, ease: 'easeIn' } }}
          >
            <div className="shell__content">
              <Page />
            </div>
          </motion.main>
        </AnimatePresence>
      </div>
    </div>
  )
}

/** Courses before the first reveal, on a wide screen: the desktop page under a slim bar, no sidebar yet. */
export function CoursesFocus() {
  const m = useModel()
  return (
    <div className="focus">
      <TopBar onBack={m.back} right={<Wordmark height={26} className="wordmark" />} />
      <main className="focus__body">
        <div className="focus__content">
          <div className="focus__title">
            <h1>Add your courses</h1>
            <p className="lead">
              {m.selectedProgram?.name ?? 'Your program'} at USask.{' '}
              {m.features.ai ? 'Your transcript is the fastest way in.' : 'Try the sample student, or add yours by search.'}
            </p>
          </div>
          <CoursesPage />
        </div>
      </main>
    </div>
  )
}

/**
 * Onboarding, welcome and the waits on a wide screen: a split wizard, brand art on one side and the
 * question on the other, with the progress along the top of the art.
 */
export function Wizard({ children }: { children: ReactNode }) {
  const m = useModel()
  const reduce = useReducedMotion()
  const showSteps = m.stepIndex >= 0
  const progress = showSteps ? (m.stepIndex + 1) / m.stepCount : 0
  return (
    <div className="wizard">
      <aside className="wizard__art" aria-hidden>
        <div className="wizard__progress">
          {showSteps && (
            <>
              <span className="wizard__progress-text">
                Step {m.stepIndex + 1} of {m.stepCount}
              </span>
              <span className="wizard__track">
                <motion.span
                  className="wizard__fill"
                  initial={false}
                  animate={{ scaleX: progress }}
                  transition={reduce ? INSTANT : { duration: DUR.slow, ease: SETTLE }}
                />
              </span>
            </>
          )}
        </div>
        <div className="wizard__brand">
          <Mark size={120} className="wizard__mark" />
          <Wordmark height={64} className="wizard__wordmark" />
          <p className="wizard__tagline">
            The credential you&rsquo;re closest to, the one course to take next, a term-by-term plan, and a call before your
            scholarship closes.
          </p>
        </div>
        <p className="wizard__foot">University of Saskatchewan · Computer Science end to end</p>
      </aside>
      <div className="wizard__pane">{children}</div>
    </div>
  )
}
