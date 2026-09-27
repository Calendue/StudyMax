import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useModel } from '../model.ts'
import { Wordmark } from '../ui/Brand.tsx'
import { Icon } from '../ui/Icon.tsx'
import { DUR, INSTANT, SETTLE, SPRING } from '../ui/motion.ts'
import { profileRows } from '../screens/profile.ts'

// Where each leaf sits on the trunk, bottom to top, alternating sides: a preview of the skill tree
// the student is about to get, one leaf per answer.
const LEAVES = [
  { y: 176, side: -1 },
  { y: 150, side: 1 },
  { y: 124, side: -1 },
  { y: 100, side: 1 },
  { y: 78, side: -1 },
  { y: 58, side: 1 },
  { y: 42, side: -1 },
]
const TRUNK = 'M100 214 C 100 180, 96 150, 100 120 S 104 60, 100 30'
const LEAF = 'M0 0 C 8 -11, 26 -13, 38 -4 C 27 6, 10 8, 0 0 Z'

/** A sapling that grows a leaf for every answer. */
function Sapling({ grown, total }: { grown: number; total: number }) {
  const reduce = useReducedMotion()
  const t = reduce ? INSTANT : { duration: DUR.slow * 1.6, ease: SETTLE }
  const reach = total === 0 ? 0 : Math.max(0.18, Math.min(1, (grown + 0.6) / total))
  return (
    <svg className="sapling" viewBox="0 0 200 224" aria-hidden focusable="false">
      <ellipse className="sapling__ground" cx="100" cy="216" rx="64" ry="6" />
      <motion.path
        className="sapling__trunk"
        d={TRUNK}
        initial={false}
        animate={{ pathLength: reach }}
        transition={t}
        style={{ pathLength: reach }}
      />
      {LEAVES.slice(0, total).map((leaf, i) => {
        const on = i < grown
        return (
          <g key={i} transform={`translate(${100 + leaf.side * 2} ${leaf.y}) scale(${leaf.side} 1) rotate(-28)`}>
            <motion.path
              className={`sapling__leaf${i === grown - 1 ? ' sapling__leaf--new' : ''}`}
              d={LEAF}
              initial={false}
              animate={{ scale: on ? 1 : 0, opacity: on ? 1 : 0 }}
              transition={reduce ? INSTANT : { duration: DUR.med * 1.4, ease: SPRING, delay: on ? 0.12 : 0 }}
              style={{ originX: 0, originY: 0.5 }}
            />
          </g>
        )
      })}
      <motion.circle
        className="sapling__bud"
        r="5"
        cx="100"
        initial={false}
        animate={{ cy: 214 - reach * 184, opacity: grown >= total && total > 0 ? 0 : 1 }}
        transition={t}
      />
    </svg>
  )
}

/**
 * The wizard's panel: the student's profile filling in as they answer, beside a sapling that grows a
 * leaf per answer. Deep ink with a soft Cherry Rose glow, so the page's one accent stays special.
 */
export function WizardPanel() {
  const m = useModel()
  const reduce = useReducedMotion()
  const rows = profileRows(m).filter((r) => r.shown)
  const filled = rows.filter((r) => r.value !== null).length
  return (
    <aside className="wizard__art">
      <Wordmark height={40} className="wizard__wordmark" />
      <div className="wizard__center">
        <Sapling grown={filled} total={rows.length} />
        <section className="profile-card" aria-label="Your answers so far">
          <header className="profile-card__head">
            <span>Your profile</span>
            <span className="profile-card__count tnum">
              {filled} of {rows.length}
            </span>
          </header>
          <ul>
            {rows.map((row) => (
              <li key={row.key} className={`profile-card__row${row.value ? ' profile-card__row--on' : ''}`}>
                <span className="profile-card__mark" aria-hidden>
                  <AnimatePresence initial={false}>
                    {row.value && (
                      <motion.span
                        key="on"
                        initial={{ scale: reduce ? 1 : 0.4, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={reduce ? INSTANT : { duration: DUR.med, ease: SPRING }}
                      >
                        <Icon name="check" size={12} />
                      </motion.span>
                    )}
                  </AnimatePresence>
                </span>
                <span className="profile-card__label">{row.label}</span>
                <AnimatePresence mode="wait" initial={false}>
                  <motion.span
                    key={row.brief ?? row.value ?? 'empty'}
                    className="profile-card__value"
                    initial={{ opacity: 0, x: reduce ? 0 : 8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0 }}
                    transition={reduce ? INSTANT : { duration: DUR.med, ease: SETTLE }}
                  >
                    {row.value ? (row.brief ?? row.value) : '—'}
                  </motion.span>
                </AnimatePresence>
              </li>
            ))}
          </ul>
        </section>
      </div>
      <p className="wizard__foot">About a minute · Change anything later</p>
    </aside>
  )
}
