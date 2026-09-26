import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { animate, motion, useReducedMotion } from 'motion/react'
import { Icon, type IconName } from './Icon.tsx'
import { SETTLE, appearTransition } from './motion.ts'

// ─────────────────────────────────────────────────────────────── buttons

type ButtonVariant = 'primary' | 'secondary' | 'quiet'

/**
 * Primary wears the accent: one per screen, the hero action. Secondary is a tonal surface, quiet is
 * text. Buttons take emphasis from fill, not from heavy type, and they're rounded rectangles, not pills.
 */
export function Button({
  variant = 'primary',
  icon,
  block,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; icon?: IconName; block?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      className={`btn btn--${variant}${block ? ' btn--block' : ''}${className ? ` ${className}` : ''}`}
    >
      {icon && <Icon name={icon} size={20} />}
      {children}
    </button>
  )
}

export function IconButton({
  icon,
  label,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { icon: IconName; label: string }) {
  return (
    <button type="button" aria-label={label} {...props} className={`icon-btn${className ? ` ${className}` : ''}`}>
      <Icon name={icon} />
    </button>
  )
}

// ─────────────────────────────────────────────────────────────── grouping

/** A small brand-voice label over a group. Quiet by construction: a divider, not a stamp. */
export function SectionLabel({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="section-label">
      <h2>{children}</h2>
      {action}
    </div>
  )
}

/** One tonal surface holding hairline-divided rows. The alternative to a stack of separate cards. */
export function Group({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={`group${className ? ` ${className}` : ''}`}>{children}</div>
}

interface RowProps {
  leading?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  trailing?: ReactNode
  onClick?: () => void
  selected?: boolean
  disabled?: boolean
  /** Position in the list, for the staggered entrance. */
  index?: number
  className?: string
}

/** A row inside a Group. Tappable rows are buttons; informational rows are not dressed as if they were. */
export function Row({ leading, title, subtitle, trailing, onClick, selected, disabled, index = 0, className }: RowProps) {
  const reduce = useReducedMotion()
  const body = (
    <>
      {leading && <span className="row__leading">{leading}</span>}
      <span className="row__body">
        <span className="row__title">{title}</span>
        {subtitle && <span className="row__subtitle">{subtitle}</span>}
      </span>
      {trailing !== undefined ? (
        <span className="row__trailing">{trailing}</span>
      ) : onClick ? (
        <Icon name="chevron" size={18} className="row__chevron" />
      ) : null}
    </>
  )
  const cls = `row${onClick ? ' row--tap' : ''}${selected ? ' row--selected' : ''}${className ? ` ${className}` : ''}`
  return (
    <motion.div
      className="row-wrap"
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={appearTransition(index, reduce)}
    >
      {onClick ? (
        <button type="button" className={cls} onClick={onClick} disabled={disabled} aria-pressed={selected}>
          {body}
        </button>
      ) : (
        <div className={cls}>{body}</div>
      )}
    </motion.div>
  )
}

/** A tinted square that holds a row's icon. */
export function RowIcon({ name, tone = 'accent' }: { name: IconName; tone?: 'accent' | 'quiet' }) {
  return (
    <span className={`row-icon row-icon--${tone}`}>
      <Icon name={name} size={20} />
    </span>
  )
}

/** Staggered entrance for anything that isn't a Row. */
export function Appear({
  index = 0,
  className,
  children,
}: {
  index?: number
  className?: string
  children: ReactNode
}) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={appearTransition(index, reduce)}
    >
      {children}
    </motion.div>
  )
}

// ─────────────────────────────────────────────────────────────── data

/** Progress in Cherry Rose on a Rosy Taupe track. The fill is a size change, so it settles. */
export function Ring({
  done,
  total,
  size = 44,
  stroke = 5,
  duration = 0.38,
  delay = 0,
  label,
  children,
}: {
  done: number
  total: number
  size?: number
  stroke?: number
  duration?: number
  delay?: number
  label?: string
  children?: ReactNode
}) {
  const reduce = useReducedMotion()
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const fraction = total > 0 ? Math.min(1, done / total) : 0
  const mid = size / 2
  return (
    <span className="ring" style={{ width: size, height: size }} role="img" aria-label={label ?? `${done} of ${total} done`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle className="ring__track" cx={mid} cy={mid} r={r} strokeWidth={stroke} />
        {fraction > 0 && (
          <motion.circle
            className="ring__fill"
            cx={mid}
            cy={mid}
            r={r}
            strokeWidth={stroke}
            strokeDasharray={c}
            transform={`rotate(-90 ${mid} ${mid})`}
            initial={reduce ? false : { strokeDashoffset: c }}
            animate={{ strokeDashoffset: c * (1 - fraction) }}
            transition={reduce ? { duration: 0 } : { duration, delay, ease: SETTLE }}
          />
        )}
      </svg>
      {children && <span className="ring__center">{children}</span>}
    </span>
  )
}

/** A number that counts to its value instead of popping in. Writes the DOM directly, no re-renders. */
export function CountUp({ value, from = 0, duration = 0.8, delay = 0 }: { value: number; from?: number; duration?: number; delay?: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const reduce = useReducedMotion()
  const last = useRef(from)
  useEffect(() => {
    const node = ref.current
    if (!node) return
    if (reduce) {
      node.textContent = String(value)
      last.current = value
      return
    }
    const controls = animate(last.current, value, {
      duration,
      delay,
      ease: SETTLE,
      onUpdate: (v) => {
        node.textContent = String(Math.round(v))
      },
    })
    last.current = value
    return () => controls.stop()
  }, [value, reduce, duration, delay])
  return (
    <span ref={ref} className="tnum" aria-label={String(value)}>
      {reduce ? value : from}
    </span>
  )
}

/** A deadline as a chip: filled Cherry Rose when it's closing soon, a quiet tint otherwise. */
export function Chip({ children, tone = 'quiet', icon }: { children: ReactNode; tone?: 'quiet' | 'urgent'; icon?: IconName }) {
  return (
    <span className={`chip chip--${tone}`}>
      {icon && <Icon name={icon} size={14} />}
      {children}
    </span>
  )
}

/** Placeholder lines in the surface tones while the AI writes. */
export function Skeleton({ lines = 2 }: { lines?: number }) {
  return (
    <span className="skeleton" aria-hidden>
      {Array.from({ length: lines }, (_, i) => (
        <span key={i} className="skeleton__line" style={{ width: i === lines - 1 && lines > 1 ? '62%' : '100%' }} />
      ))}
    </span>
  )
}

/**
 * AI-written text reveals at a reading cadence, snapped to word boundaries, instead of popping
 * in as a block. The unrevealed rest is already laid out (transparent), so the paragraph has its
 * final height from the first frame and nothing below it moves.
 */
export function StreamedText({ text, className }: { text: string; className?: string }) {
  const reduce = useReducedMotion()
  // Keyed by the text it belongs to, so new text starts from nothing rather than from the old cut.
  const [progress, setProgress] = useState({ text, shown: 0 })
  useEffect(() => {
    if (reduce) return
    let revealed = 0
    const id = window.setInterval(() => {
      const backlog = text.length - revealed
      if (backlog <= 0) {
        window.clearInterval(id)
        return
      }
      let next = revealed + Math.max(2, Math.floor(backlog / 16))
      const space = text.slice(next, next + 12).search(/\s/)
      if (space >= 0) next += space + 1
      revealed = Math.min(next, text.length)
      setProgress({ text, shown: revealed })
    }, 40)
    return () => window.clearInterval(id)
  }, [text, reduce])
  const cut = reduce ? text.length : progress.text === text ? progress.shown : 0
  return (
    <p className={className}>
      {text.slice(0, cut)}
      <span className="stream__rest" aria-hidden={cut < text.length ? undefined : true}>
        {text.slice(cut)}
      </span>
    </p>
  )
}

/** A requirement slot offering a dozen interchangeable courses names a few, then lets you open the rest. */
export function OptionList({ options, label }: { options: string[]; label: (code: string) => string }) {
  const [open, setOpen] = useState(false)
  const SHOWN = 2
  if (options.length <= SHOWN + 1 || open) return <>{options.map(label).join(' or ')}</>
  return (
    <>
      {options.slice(0, SHOWN).map(label).join(' or ')}{' '}
      <button type="button" className="inline-link" onClick={() => setOpen(true)}>
        or {options.length - SHOWN} other options
      </button>
    </>
  )
}
