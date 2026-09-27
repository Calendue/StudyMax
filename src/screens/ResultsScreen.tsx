import type { ComponentType } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useModel } from '../model.ts'
import type { Tab } from '../App.tsx'
import { TopBar } from '../ui/chrome.tsx'
import { Icon } from '../ui/Icon.tsx'
import { TabBar } from '../ui/TabBar.tsx'
import { DUR, INSTANT } from '../ui/motion.ts'
import { OverviewTab } from './OverviewTab.tsx'
import { PlanTab } from './PlanTab.tsx'
import { AwardsTab } from './AwardsTab.tsx'
import { ClassesTab } from './ClassesTab.tsx'

const TAB_CONTENT: Record<Tab, ComponentType> = {
  overview: OverviewTab,
  plan: PlanTab,
  awards: AwardsTab,
  classes: ClassesTab,
}

/** The phone's results: the brand on top, one tab at a time, and CalenDue's tab bar underneath. */
export function ResultsScreen() {
  const m = useModel()
  const reduce = useReducedMotion()
  const Content = TAB_CONTENT[m.tab]
  return (
    <>
      <TopBar
        brand
        noAccount
        right={
          <div className="topbar__actions">
            {m.hasProgramData && (
              <button type="button" className="topbar__action" onClick={() => m.navigate('courses')}>
                <Icon name="browse" size={18} />
                Courses
              </button>
            )}
            {/* Without program data there are no tabs, so settings live up here instead. */}
            {!m.hasProgramData && (
              <button type="button" className="icon-btn" aria-label="Account and settings" onClick={() => m.openSheet('account')}>
                <Icon name="settings" />
              </button>
            )}
          </div>
        }
      />
      {/* A tab change is a destination change: a quick fade-through on one timeline, never a
          double exposure of two tabs. */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.main
          key={m.tab}
          className="screen__body"
          initial={{ opacity: 0, y: reduce ? 0 : 6 }}
          animate={{ opacity: 1, y: 0, transition: reduce ? INSTANT : { duration: DUR.med * 0.6, ease: 'easeOut' } }}
          exit={{ opacity: 0, transition: reduce ? INSTANT : { duration: DUR.med * 0.4, ease: 'easeIn' } }}
        >
          <div className="screen__content">
            <Content />
          </div>
        </motion.main>
      </AnimatePresence>
      {m.hasProgramData && <TabBar />}
    </>
  )
}
