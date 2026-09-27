import type { ComponentType, ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useModel } from '../model.ts'
import { Wordmark } from '../ui/Brand.tsx'
import { DUR, INSTANT, SETTLE } from '../ui/motion.ts'
import type { LayoutMode } from '../ui/layout.ts'
import { TopBar } from '../ui/chrome.tsx'
import { CallScreen } from '../screens/CallScreen.tsx'
import { DashboardPage } from '../pages/DashboardPage.tsx'
import { PlanPage } from '../pages/PlanPage.tsx'
import { AwardsPage } from '../pages/AwardsPage.tsx'
import { ClassesPage } from '../pages/ClassesPage.tsx'
import { CoursesPage } from '../pages/CoursesPage.tsx'
import { Header } from './Header.tsx'
import { Rail, Sidebar } from './Sidebar.tsx'
import { StepProgress } from '../screens/Onboarding.tsx'
import { WizardPanel } from './WizardPanel.tsx'
import './shell.css'

/** The call is a focused moment: its own column inside the shell, with its own Back. */
function CallPage() {
  return (
    <div className="shell-focus">
      <CallScreen />
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
}

/**
 * The app on a tablet or a desktop once there are results: the leading navigation (a rail, or the
 * full sidebar), the header, and one page at a time. It reads the same screen and tab as the phone,
 * so resizing the window never loses your place.
 */
export function AppShell({ mode }: { mode: Exclude<LayoutMode, 'tabs'> }) {
  const m = useModel()
  const reduce = useReducedMotion()
  const page = m.screen === 'courses' ? 'courses' : m.screen === 'call' ? 'call' : m.tab
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
 * Onboarding, welcome and the waits on a wide screen: a split wizard. The panel (the profile filling
 * in beside a growing sapling) stays put while the questions change beside it, and so does the
 * progress bar above them.
 */
export function Wizard({ children }: { children: ReactNode }) {
  return (
    <div className="wizard">
      <WizardPanel />
      <div className="wizard__pane">
        <div className="wizard__top">
          <StepProgress />
        </div>
        <div className="wizard__stage">{children}</div>
      </div>
    </div>
  )
}
