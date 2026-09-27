import { motion, useReducedMotion } from 'motion/react'
import { useModel } from '../model.ts'
import { Mark, Wordmark } from '../ui/Brand.tsx'
import { Avatar } from '../ui/chrome.tsx'
import { Icon } from '../ui/Icon.tsx'
import { DESTINATIONS, type Destination } from '../ui/layout.ts'
import { useActiveDestination } from './useShellData.ts'

// The desktop's leading navigation, from TandemTeach: a 256px sidebar in the brand colour whose active
// item is a pill of the PAGE colour that cuts into the content, with inverted corners above and below
// it, so the page seems to flow out of the sidebar. The pill slides between items (a shared layoutId).
// On regular widths the same list is a rail of icons and short labels, as CalenDue's shell does it.

const SLIDE = { type: 'spring', damping: 26, stiffness: 300, mass: 0.8 } as const

function useDestinations() {
  const m = useModel()
  return DESTINATIONS.filter(
    (d) => (d.id !== 'classes' || m.universityId === 'usask') && (m.hasProgramData || d.id === 'awards' || d.id === 'courses'),
  )
}

export function Sidebar() {
  const m = useModel()
  const reduce = useReducedMotion()
  const active = useActiveDestination()
  const items = useDestinations()
  const badge = (id: Destination) => id === 'classes' && m.classes.alert !== null && active !== 'classes'
  return (
    <aside className="sidebar" aria-label="StudyMax">
      <div className="sidebar__brand">
        <Mark size={34} className="sidebar__mark" />
        <Wordmark height={33} className="sidebar__wordmark" />
      </div>

      <nav className="sidebar__nav" aria-label="Main">
        <ul role="list">
          {items.map((d) => {
            const on = active === d.id
            return (
              <li key={d.id}>
                <button
                  type="button"
                  className={`sidebar__item${on ? ' sidebar__item--active' : ''}`}
                  aria-current={on ? 'page' : undefined}
                  onClick={() => m.navigate(d.id)}
                >
                  {on && (
                    <motion.span
                      layoutId="sidebar-notch"
                      className="sidebar__notch"
                      transition={reduce ? { duration: 0 } : SLIDE}
                      aria-hidden
                    />
                  )}
                  <span className="sidebar__icon">
                    <Icon name={d.icon} size={20} />
                    {badge(d.id) && <span className="tab__badge" aria-label="new" />}
                  </span>
                  <span className="sidebar__label">{d.label}</span>
                </button>
              </li>
            )
          })}
        </ul>

        <ul role="list" className="sidebar__group">
          <li>
            <button type="button" className="sidebar__item" onClick={() => m.openSheet('account')}>
              <span className="sidebar__icon">{m.account ? <Avatar account={m.account} size={22} /> : <Icon name="settings" size={20} />}</span>
              <span className="sidebar__label">Settings</span>
            </button>
          </li>
        </ul>
      </nav>

      <ul role="list" className="sidebar__quiet">
        <li>
          <button type="button" className="sidebar__quiet-item" onClick={() => m.setShowLanding(true)}>
            <Icon name="globe" size={18} />
            The pitch
          </button>
        </li>
        <li>
          <button type="button" className="sidebar__quiet-item" onClick={m.startOver}>
            <Icon name="restart" size={18} />
            Start over
          </button>
        </li>
      </ul>
    </aside>
  )
}

export function Rail() {
  const m = useModel()
  const reduce = useReducedMotion()
  const active = useActiveDestination()
  const items = useDestinations()
  const badge = (id: Destination) => id === 'classes' && m.classes.alert !== null && active !== 'classes'
  return (
    <aside className="rail" aria-label="StudyMax">
      <Mark size={34} className="rail__mark" />
      <nav aria-label="Main">
        <ul role="list" className="rail__list">
          {items.map((d) => {
            const on = active === d.id
            return (
              <li key={d.id}>
                <button
                  type="button"
                  className={`rail__item${on ? ' rail__item--active' : ''}`}
                  aria-current={on ? 'page' : undefined}
                  onClick={() => m.navigate(d.id)}
                >
                  {on && (
                    <motion.span layoutId="rail-capsule" className="rail__capsule" transition={reduce ? { duration: 0 } : SLIDE} aria-hidden />
                  )}
                  <span className="tab__icon">
                    <Icon name={d.icon} size={22} />
                    {badge(d.id) && <span className="tab__badge" aria-label="new" />}
                  </span>
                  <span className="rail__label">{d.label}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </nav>
      <div className="rail__end">
        <button type="button" className="rail__item" aria-label="Account and settings" onClick={() => m.openSheet('account')}>
          <span className="tab__icon">{m.account ? <Avatar account={m.account} size={24} /> : <Icon name="settings" size={22} />}</span>
          <span className="rail__label">{m.account ? 'You' : 'Settings'}</span>
        </button>
      </div>
    </aside>
  )
}
