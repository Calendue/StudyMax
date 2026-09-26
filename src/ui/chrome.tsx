import type { ReactNode } from 'react'
import { Icon, Mark } from './Icon.tsx'

/** The top of a screen: Back on the left (never on the first screen), an optional action on the right. */
export function TopBar({ onBack, backLabel = 'Back', right, brand }: { onBack?: () => void; backLabel?: string; right?: ReactNode; brand?: boolean }) {
  return (
    <header className="topbar">
      <div className="topbar__side">
        {onBack && (
          <button type="button" className="topbar__back" onClick={onBack}>
            <Icon name="back" />
            <span>{backLabel}</span>
          </button>
        )}
        {brand && (
          <span className="wordmark">
            <Mark size={22} className="wordmark__mark" />
            StudyMax
          </span>
        )}
      </div>
      <div className="topbar__side topbar__side--end">{right}</div>
    </header>
  )
}

/** The scrolling body of a screen. Only this scrolls; the root never rubber-bands. */
export function ScreenBody({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <main className={`screen__body${className ? ` ${className}` : ''}`}>
      <div className="screen__content">{children}</div>
    </main>
  )
}

/** The screen's title in the brand voice, with an optional line under it. */
export function ScreenTitle({ children, lead }: { children: ReactNode; lead?: ReactNode }) {
  return (
    <div className="screen-title">
      <h1>{children}</h1>
      {lead && <p className="screen-title__lead">{lead}</p>}
    </div>
  )
}

/** The bar that floats above the page with the screen's one hero action. */
export function ActionBar({ children, note }: { children: ReactNode; note?: ReactNode }) {
  return (
    <footer className="actionbar">
      {note && <p className="actionbar__note">{note}</p>}
      {children}
    </footer>
  )
}
