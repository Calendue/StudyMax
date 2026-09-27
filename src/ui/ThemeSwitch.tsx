import { useId } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { useModel } from '../model.ts'
import { haptic } from '../platform.ts'
import type { ThemePref } from '../theme.ts'
import { Icon, type IconName } from './Icon.tsx'

const MORPH = { type: 'spring', stiffness: 260, damping: 22 } as const

/** A sun whose rays fold away as a shadow slides across its face, leaving a moon. */
function SunMoon({ dark, size = 16 }: { dark: boolean; size?: number }) {
  const reduce = useReducedMotion()
  const t = reduce ? { duration: 0 } : MORPH
  const mask = `sun-moon-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden focusable="false">
      {/* A mask is luminance, not colour: its fill says "show" or "hide", never a theme colour. */}
      <mask id={mask}>
        <rect x="0" y="0" width="24" height="24" fill="white" />
        <motion.circle r="7" fill="black" initial={false} animate={{ cx: dark ? 17 : 32, cy: dark ? 7 : -8 }} transition={t} />
      </mask>
      <motion.circle cx="12" cy="12" fill="currentColor" mask={`url(#${mask})`} initial={false} animate={{ r: dark ? 8.5 : 4.6 }} transition={t} />
      <motion.g
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        style={{ originX: '12px', originY: '12px' }}
        initial={false}
        animate={{ opacity: dark ? 0 : 1, scale: dark ? 0.5 : 1, rotate: dark ? -60 : 0 }}
        transition={t}
      >
        <path d="M12 2.5v1.8M12 19.7v1.8M4.6 4.6l1.3 1.3M18.1 18.1l1.3 1.3M2.5 12h1.8M19.7 12h1.8M4.6 19.4l1.3-1.3M18.1 5.9l1.3-1.3" />
      </motion.g>
    </svg>
  )
}

/** The header's sliding switch: light one side, dark the other. The account menu offers System. */
export function ThemeSwitch() {
  const m = useModel()
  const reduce = useReducedMotion()
  const dark = m.theme === 'dark'
  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      aria-label="Dark mode"
      title={dark ? 'Switch to light' : 'Switch to dark'}
      className={`theme-switch${dark ? ' theme-switch--dark' : ''}`}
      onClick={() => {
        haptic.selection()
        m.setThemePref(dark ? 'light' : 'dark')
      }}
    >
      <motion.span
        className="theme-switch__knob"
        initial={false}
        animate={{ x: dark ? 22 : 0 }}
        transition={reduce ? { duration: 0 } : MORPH}
      >
        <SunMoon dark={dark} />
      </motion.span>
    </button>
  )
}

const CHOICES: { id: ThemePref; label: string; icon: IconName }[] = [
  { id: 'system', label: 'System', icon: 'device' },
  { id: 'light', label: 'Light', icon: 'sun' },
  { id: 'dark', label: 'Dark', icon: 'moon' },
]

/** System, Light or Dark, as one segmented control: the account sheet and the account menu. */
export function ThemeChoice() {
  const m = useModel()
  return (
    <div className="segmented segmented--labels" role="radiogroup" aria-label="Appearance">
      {CHOICES.map((c) => (
        <button
          key={c.id}
          type="button"
          role="radio"
          aria-checked={m.themePref === c.id}
          className={`segmented__option${m.themePref === c.id ? ' segmented__option--on' : ''}`}
          onClick={() => {
            haptic.selection()
            m.setThemePref(c.id)
          }}
        >
          <Icon name={c.icon} size={16} />
          {c.label}
        </button>
      ))}
    </div>
  )
}
