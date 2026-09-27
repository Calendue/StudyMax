import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { useModel } from '../model.ts'
import { haptic } from '../platform.ts'
import { Avatar } from './chrome.tsx'
import { Icon } from './Icon.tsx'
import { DESTINATIONS, type Destination } from './layout.ts'

// CalenDue's tab bar, ported from React Native to the DOM. A persistent "glass" capsule sits behind
// the active tab, the way iOS Files draws its own, and springs between tabs when the tab changes.
// A tap switches immediately. A long press arms the capsule: slide a finger across the bar and it
// snaps between the tabs under it, then releasing navigates. Keyboard and screen-reader users keep
// plain buttons, since a long press is only ever a pointer gesture. Under reduced motion the capsule
// jumps instead of travelling; it is state, not decoration, so it never disappears.

/** How long a hold lasts before it arms the slider instead of being a tap. */
const LONG_PRESS_MS = 260
/** How far a finger may roll during a press and still count as a tap. */
const TAP_SLOP = 24
/** Tuned to settle quickly with a light overshoot: a glide, not a jump cut, and not a wobble. */
const CAPSULE_SPRING = { type: 'spring', damping: 22, stiffness: 260, mass: 0.7 } as const

interface Slot {
  x: number
  width: number
}

/** A label that would truncate at a very large text size is dropped and the icons stand alone. */
function useLargeText() {
  const [large] = useState(() => parseFloat(getComputedStyle(document.documentElement).fontSize) >= 22)
  return large
}

export function TabBar() {
  const m = useModel()
  const reduce = useReducedMotion()
  const largeText = useLargeText()
  // Seat watching reads USask's own class search, so the Class Tracker tab is USask-only.
  const tabs = DESTINATIONS.filter((d) => d.id !== 'courses' && (d.id !== 'classes' || m.universityId === 'usask'))
  const activeIndex = Math.max(0, tabs.findIndex((t) => t.id === m.tab))

  const barRef = useRef<HTMLDivElement>(null)
  const slotRefs = useRef<(HTMLButtonElement | null)[]>([])
  const [slots, setSlots] = useState<Slot[]>([])
  const [capsuleIndex, setCapsuleIndex] = useState(activeIndex)

  // Measured, not derived: the bar's edge padding isn't uniform, so each tab reports its own box.
  const tabCount = tabs.length
  useLayoutEffect(() => {
    const bar = barRef.current
    if (!bar) return
    const measure = () =>
      setSlots(slotRefs.current.slice(0, tabCount).map((el) => ({ x: el?.offsetLeft ?? 0, width: el?.offsetWidth ?? 0 })))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(bar)
    return () => observer.disconnect()
  }, [tabCount])

  // --- the hold-then-drag gesture ---
  const press = useRef<{ id: number; x: number; y: number; index: number } | null>(null)
  const armed = useRef(false)
  const timer = useRef<number | null>(null)
  const swallowClick = useRef(false)

  // The capsule follows the active tab however it changed (tap, deep link, Android back), but never
  // while a drag has it.
  useEffect(() => {
    if (!armed.current) setCapsuleIndex(activeIndex)
  }, [activeIndex])

  function clearTimer() {
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = null
  }

  function slotAt(clientX: number): number {
    const rect = barRef.current?.getBoundingClientRect()
    if (!rect) return -1
    const x = clientX - rect.left
    return slots.findIndex((s) => x >= s.x && x < s.x + s.width)
  }

  function commit(index: number) {
    const dest = tabs[index]?.id
    if (dest) m.navigate(dest)
  }

  function onPointerDown(e: ReactPointerEvent, index: number) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    press.current = { id: e.pointerId, x: e.clientX, y: e.clientY, index }
    clearTimer()
    timer.current = window.setTimeout(() => {
      if (!press.current) return
      armed.current = true
      haptic.selection()
      setCapsuleIndex(index)
      // The bar keeps the pointer from here on, so the drag can leave the button it started on.
      try {
        barRef.current?.setPointerCapture(press.current.id)
      } catch {
        // the pointer already lifted
      }
    }, LONG_PRESS_MS)
  }

  function onPointerMove(e: ReactPointerEvent) {
    const p = press.current
    if (!p) return
    if (!armed.current) {
      if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > TAP_SLOP) clearTimer()
      return
    }
    const found = slotAt(e.clientX)
    if (found !== -1 && found !== capsuleIndex) {
      haptic.selection()
      setCapsuleIndex(found)
    }
  }

  function onPointerUp(e: ReactPointerEvent) {
    clearTimer()
    press.current = null
    if (!armed.current) return
    armed.current = false
    swallowClick.current = true
    // Re-derived from the release point; past the bar's edge keeps whichever tab was last armed.
    const found = slotAt(e.clientX)
    const index = found === -1 ? capsuleIndex : found
    setCapsuleIndex(index)
    commit(index)
  }

  function onPointerCancel() {
    clearTimer()
    press.current = null
    if (armed.current) {
      armed.current = false
      setCapsuleIndex(activeIndex)
    }
  }

  function onTap(index: number) {
    // A released drag also ends in a click on whatever it started on; the drag already navigated.
    if (swallowClick.current) {
      swallowClick.current = false
      return
    }
    commit(index)
  }

  const slot = slots[capsuleIndex]
  const badge = (id: Destination) => id === 'classes' && m.classes.alert !== null && m.tab !== 'classes'

  return (
    <nav className={`tabbar${largeText ? ' tabbar--icons' : ''}`} aria-label="Results">
      <div
        ref={barRef}
        className="tabbar__slots"
        role="tablist"
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onContextMenu={(e) => e.preventDefault()}
      >
        {slot && slot.width > 0 && (
          <motion.span
            className="tabbar__capsule"
            aria-hidden
            initial={false}
            animate={{ x: slot.x, width: slot.width }}
            transition={reduce ? { duration: 0 } : CAPSULE_SPRING}
          />
        )}
        {tabs.map((t, i) => {
          const active = m.tab === t.id
          return (
            <button
              key={t.id}
              ref={(el) => {
                slotRefs.current[i] = el
              }}
              type="button"
              role="tab"
              aria-selected={active}
              aria-label={largeText ? t.short : undefined}
              className={`tab${active ? ' tab--active' : ''}${capsuleIndex === i ? ' tab--under' : ''}`}
              onPointerDown={(e) => onPointerDown(e, i)}
              onClick={() => onTap(i)}
            >
              <span className="tab__icon">
                <Icon name={t.icon} size={22} />
                {badge(t.id) && <span className="tab__badge" aria-label="new" />}
              </span>
              {!largeText && <span className="tab__label">{t.short}</span>}
            </button>
          )
        })}
      </div>
      {/* Account and settings, reachable from the bar as CalenDue's settings glyph is: a sheet, not a
          destination, so the capsule never lands on it. */}
      <button
        type="button"
        className="tab tab--account"
        aria-label="Account and settings"
        onClick={() => m.openSheet('account')}
      >
        <span className="tab__icon">{m.account ? <Avatar account={m.account} size={24} /> : <Icon name="settings" size={22} />}</span>
        {!largeText && <span className="tab__label">Settings</span>}
      </button>
    </nav>
  )
}
