import type { ComponentType } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useModel } from '../model.ts'
import type { Tab } from '../App.tsx'
import { TopBar } from '../ui/chrome.tsx'
import { Icon, type IconName } from '../ui/Icon.tsx'
import { DUR, INSTANT } from '../ui/motion.ts'
import { OverviewTab } from './OverviewTab.tsx'
import { PlanTab } from './PlanTab.tsx'
import { AwardsTab } from './AwardsTab.tsx'

const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'overview', label: 'Closest', icon: 'target' },
  { id: 'plan', label: 'Plan', icon: 'plan' },
  { id: 'awards', label: 'Awards', icon: 'award' },
]

const TAB_CONTENT: Record<Tab, ComponentType> = {
  overview: OverviewTab,
  plan: PlanTab,
  awards: AwardsTab,
}

function TabButton({ label, icon, active, onClick }: { label: string; icon: IconName; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={`tab${active ? ' tab--active' : ''}`}
      onClick={onClick}
    >
      <Icon name={icon} size={24} />
      <span>{label}</span>
    </button>
  )
}

export function ResultsScreen() {
  const m = useModel()
  const reduce = useReducedMotion()
  const Content = TAB_CONTENT[m.tab]
  return (
    <>
      <TopBar
        onBack={() => m.go(m.resultsBack, -1)}
        backLabel={m.resultsBack === 'courses' ? 'Courses' : 'Back'}
        right={
          <div className="topbar__actions">
            <button type="button" className="topbar__action" onClick={() => m.setShowLanding(true)}>
              <Icon name="globe" size={18} />
              Pitch
            </button>
            <button type="button" className="topbar__action" onClick={m.startOver}>
              <Icon name="restart" size={18} />
              Start over
            </button>
          </div>
        }
      />
      {/* The same tabs as the bottom bar, laid out as a top strip instead — CSS alone swaps which
          one shows, at the same width the rest of the app already treats as "desktop". */}
      {m.hasProgramData && (
        <nav className="topnav" role="tablist" aria-label="Results">
          {TABS.map((t) => (
            <TabButton key={t.id} label={t.label} icon={t.icon} active={m.tab === t.id} onClick={() => m.setTab(t.id)} />
          ))}
        </nav>
      )}
      {/* A tab change is a destination change: a quick fade-through on one timeline, never a
          double exposure of two tabs. */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.main
          key={m.tab}
          className="screen__body"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: reduce ? INSTANT : { duration: DUR.med * 0.6, ease: 'easeOut' } }}
          exit={{ opacity: 0, transition: reduce ? INSTANT : { duration: DUR.med * 0.4, ease: 'easeIn' } }}
        >
          <div className="screen__content">
            <Content />
          </div>
        </motion.main>
      </AnimatePresence>
      {m.hasProgramData && (
        <nav className="tabbar" role="tablist" aria-label="Results">
          {TABS.map((t) => (
            <TabButton key={t.id} label={t.label} icon={t.icon} active={m.tab === t.id} onClick={() => m.setTab(t.id)} />
          ))}
        </nav>
      )}
    </>
  )
}
