import { useState, type ReactNode } from 'react'
import { Icon } from './Icon.tsx'
import { Wordmark } from './Brand.tsx'
import { useModel } from '../model.ts'
import { initial, type Account } from '../auth.ts'

/** The student's photo, or their initial on a tinted disc when there's no photo (or it won't load). */
export function Avatar({ account, size = 32 }: { account: Account; size?: number }) {
  const [failed, setFailed] = useState(false)
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.42 }} aria-hidden>
      {account.photoUrl && !failed ? (
        <img src={account.photoUrl} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
      ) : (
        initial(account)
      )}
    </span>
  )
}

/** Signed in: a small avatar at the end of the top bar that opens the account sheet. */
function AccountButton() {
  const m = useModel()
  if (!m.account) return null
  return (
    <button type="button" className="topbar__account" aria-label="Your account" onClick={() => m.openSheet('account')}>
      <Avatar account={m.account} />
    </button>
  )
}

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
          <Wordmark height={30} className="wordmark" />
        )}
      </div>
      <div className="topbar__side topbar__side--end">
        {right}
        <AccountButton />
      </div>
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
export function ScreenTitle({ children, lead, greeting }: { children: ReactNode; lead?: ReactNode; greeting?: ReactNode }) {
  return (
    <div className="screen-title">
      {greeting && <p className="screen-title__greeting">{greeting}</p>}
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
