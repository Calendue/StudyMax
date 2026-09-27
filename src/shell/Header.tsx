import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useModel } from '../model.ts'
import { initial, isAuthConfigured } from '../auth.ts'
import { Avatar } from '../ui/chrome.tsx'
import { Icon } from '../ui/Icon.tsx'
import { DUR, INSTANT, SETTLE } from '../ui/motion.ts'
import { ThemeChoice, ThemeSwitch } from '../ui/ThemeSwitch.tsx'
import { destinationInfo } from '../ui/layout.ts'
import { useActiveDestination, useNotes, useSearchHits, type Hit } from './useShellData.ts'

// The desktop header, from TandemTeach: the page title on the page background, then search with live
// suggestions, a notifications bell, the sliding theme switch, and the avatar with its menu.

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

/** A dropdown under a header control. Closes on Escape and on a click anywhere outside it. */
function Popover({ open, onClose, children, className }: { open: boolean; onClose: () => void; children: ReactNode; className?: string }) {
  const reduce = useReducedMotion()
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const anchor = ref.current?.parentElement
      if (anchor && !anchor.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={ref}
          className={`popover${className ? ` ${className}` : ''}`}
          initial={reduce ? false : { opacity: 0, y: -6, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1, transition: reduce ? INSTANT : { duration: DUR.fast, ease: SETTLE } }}
          exit={{ opacity: 0, y: -4, transition: reduce ? INSTANT : { duration: 0.12 } }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function Search() {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [cursor, setCursor] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const hits = useSearchHits(query)

  // Cmd/Ctrl+K from anywhere focuses the search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        input.current?.focus()
        input.current?.select()
        setOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const grouped = useMemo(() => {
    const groups = new Map<string, { hit: Hit; index: number }[]>()
    hits.forEach((hit, index) => groups.set(hit.group, [...(groups.get(hit.group) ?? []), { hit, index }]))
    return [...groups]
  }, [hits])

  function run(hit: Hit | undefined) {
    if (!hit) return
    hit.run()
    setQuery('')
    setOpen(false)
    input.current?.blur()
  }

  const active = Math.min(cursor, Math.max(0, hits.length - 1))
  return (
    <div className="search">
      <label className="search__field">
        <Icon name="search" size={18} />
        <input
          ref={input}
          type="search"
          value={query}
          placeholder="Search courses, credentials, awards"
          aria-label="Search StudyMax"
          aria-expanded={open}
          aria-controls="search-results"
          aria-activedescendant={open && hits[active] ? `hit-${hits[active].id}` : undefined}
          role="combobox"
          autoComplete="off"
          spellCheck={false}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value)
            setCursor(0)
            setOpen(true)
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setCursor((c) => Math.min(c + 1, hits.length - 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setCursor((c) => Math.max(c - 1, 0))
            } else if (e.key === 'Enter') {
              e.preventDefault()
              run(hits[active])
            } else if (e.key === 'Escape') {
              setOpen(false)
              input.current?.blur()
            }
          }}
        />
        <kbd className="search__kbd" aria-hidden>
          {isMac ? '⌘K' : 'Ctrl K'}
        </kbd>
      </label>
      <Popover open={open} onClose={() => setOpen(false)} className="popover--search">
        <div id="search-results" role="listbox" aria-label="Search results">
          {hits.length === 0 ? (
            <p className="popover__empty">Nothing matches &ldquo;{query.trim()}&rdquo;. Try a course code like CMPT 280.</p>
          ) : (
            grouped.map(([group, items]) => (
              <div key={group} className="search__group">
                <p className="popover__label">{group}</p>
                {items.map(({ hit, index }) => (
                  <button
                    key={hit.id}
                    id={`hit-${hit.id}`}
                    type="button"
                    role="option"
                    aria-selected={index === active}
                    className={`search__hit${index === active ? ' search__hit--active' : ''}`}
                    onMouseEnter={() => setCursor(index)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => run(hit)}
                  >
                    <span className="search__hit-icon">
                      <Icon name={hit.icon} size={16} />
                    </span>
                    <span className="search__hit-text">
                      <span className="search__hit-title">{hit.title}</span>
                      {hit.meta && <span className="search__hit-meta">{hit.meta}</span>}
                    </span>
                    {index === active && <Icon name="arrow" size={16} className="search__hit-go" />}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      </Popover>
    </div>
  )
}

function Notifications() {
  const m = useModel()
  const notes = useNotes()
  const [open, setOpen] = useState(false)
  const [seen, setSeen] = useState<Set<string>>(() => new Set())
  const unseen = notes.filter((n) => !seen.has(n.id)).length
  return (
    <div className="header__pop">
      <button
        type="button"
        className="header__icon-btn"
        aria-label={unseen > 0 ? `Notifications, ${unseen} new` : 'Notifications'}
        aria-expanded={open}
        onClick={() => {
          setOpen((o) => !o)
          setSeen(new Set(notes.map((n) => n.id)))
        }}
      >
        <Icon name="bell" size={20} />
        {unseen > 0 && <span className="header__count tnum">{unseen}</span>}
      </button>
      <Popover open={open} onClose={() => setOpen(false)} className="popover--notes">
        <p className="popover__title">Notifications</p>
        {notes.length === 0 ? (
          <div className="popover__empty">
            <Icon name="check" size={20} />
            <p>All quiet. Deadlines inside two weeks and seats that open will show up here.</p>
          </div>
        ) : (
          <ul role="list" className="notes">
            {notes.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  className={`note${n.urgent ? ' note--urgent' : ''}`}
                  onClick={() => {
                    setOpen(false)
                    m.navigate(n.dest)
                  }}
                >
                  <span className="note__icon">
                    <Icon name={n.icon} size={16} />
                  </span>
                  <span className="note__text">
                    <span className="note__title">{n.title}</span>
                    <span className="note__body">{n.body}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Popover>
    </div>
  )
}

function AccountMenu() {
  const m = useModel()
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)
  const account = m.account
  return (
    <div className="header__pop">
      <button type="button" className="header__avatar" aria-label="Account menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {account ? (
          <Avatar account={account} size={36} />
        ) : (
          <span className="avatar avatar--guest" style={{ width: 36, height: 36 }}>
            <Icon name="person" size={20} />
          </span>
        )}
        <Icon name="down" size={16} className="header__caret" />
      </button>
      <Popover open={open} onClose={close} className="popover--menu">
        <div className="menu__who">
          <p className="menu__name">{account ? (account.name ?? initial(account)) : 'Guest'}</p>
          <p className="menu__email">{account ? (account.email ?? 'Signed in') : 'Saved on this device only'}</p>
        </div>
        <p className="popover__label">Appearance</p>
        <ThemeChoice />
        <div className="menu__items">
          <button type="button" className="menu__item" onClick={() => (close(), m.navigate('courses'))}>
            <Icon name="browse" size={18} />
            Your courses
          </button>
          {account && (
            <button type="button" className="menu__item" onClick={() => (close(), m.openSheet('account'))}>
              <Icon name="person" size={18} />
              Your account
            </button>
          )}
          <button type="button" className="menu__item" onClick={() => (close(), m.setShowLanding(true))}>
            <Icon name="globe" size={18} />
            The pitch
          </button>
          <button type="button" className="menu__item" onClick={() => (close(), m.startOver())}>
            <Icon name="restart" size={18} />
            Start over
          </button>
          {account ? (
            <button type="button" className="menu__item" onClick={() => (close(), void m.signOutOfAccount())}>
              <Icon name="signout" size={18} />
              Sign out
            </button>
          ) : (
            isAuthConfigured && (
              <button type="button" className="menu__item" onClick={() => (close(), m.go('welcome'))}>
                <Icon name="person" size={18} />
                Sign in
              </button>
            )
          )}
        </div>
      </Popover>
    </div>
  )
}

export function Header() {
  const m = useModel()
  const active = useActiveDestination()
  const title = m.screen === 'call' ? 'Get a call' : destinationInfo(active).title
  // Where the student is: the school and the program, the way TandemTeach's header names the class.
  const context = [m.universityId === 'usask' ? 'University of Saskatchewan' : 'Your university', m.selectedProgram?.name]
    .filter(Boolean)
    .join(' · ')
  return (
    <header className="header">
      <div className="header__title">
        <p className="header__eyebrow">
          {context}
        </p>
        <h1>{title}</h1>
      </div>
      <div className="header__tools">
        <Search />
        <Notifications />
        <ThemeSwitch />
        <AccountMenu />
      </div>
    </header>
  )
}
