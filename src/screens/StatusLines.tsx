import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Icon } from '../ui/Icon.tsx'
import { DUR, INSTANT, SPRING } from '../ui/motion.ts'

export interface StatusLine {
  text: string
  state: 'pending' | 'active' | 'done'
}

/** What's happening, one line at a time: done lines get a check, the live one a breathing dot. */
export function StatusLines({ lines }: { lines: StatusLine[] }) {
  const reduce = useReducedMotion()
  return (
    <ol className="status-lines" aria-live="polite">
      <AnimatePresence initial={false}>
        {lines.map((line) => (
          <motion.li
            key={line.text}
            className={`status-line status-line--${line.state}`}
            initial={reduce ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={reduce ? INSTANT : { duration: DUR.med, ease: SPRING }}
          >
            <span className="status-line__icon" aria-hidden>
              {line.state === 'done' ? <Icon name="check" size={16} /> : <span className="status-line__dot" />}
            </span>
            <span>{line.text}</span>
          </motion.li>
        ))}
      </AnimatePresence>
    </ol>
  )
}
