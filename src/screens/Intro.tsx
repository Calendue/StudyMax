import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Mark, Wordmark } from '../ui/Brand.tsx'
import { DUR, SPRING, prefersReducedMotion } from '../ui/motion.ts'
import { hideSplash } from '../platform.ts'

// The hand-over from the native splash: the same mark, the same size, the same place (centred in
// the full screen, not the safe area), so the splash seems to simply come alive. The wordmark
// springs in under it and the whole thing lifts away. Under a second from first paint.
export function Intro() {
  const [shown, setShown] = useState(() => !prefersReducedMotion())
  useEffect(() => {
    hideSplash()
    if (!shown) return
    const id = setTimeout(() => setShown(false), 620)
    return () => clearTimeout(id)
  }, [shown])
  return (
    <AnimatePresence>
      {shown && (
        <motion.div
          key="intro"
          className="intro"
          aria-hidden
          exit={{ opacity: 0, transition: { duration: DUR.med, ease: 'easeIn' } }}
        >
          <motion.div exit={{ scale: 0.92, y: -8, transition: { duration: DUR.med, ease: 'easeIn' } }} className="intro__stack">
            <Mark size={96} className="intro__mark" />
            <motion.span
              className="intro__word"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: DUR.med, ease: SPRING, delay: 0.12 }}
            >
              <Wordmark height={44} />
            </motion.span>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
