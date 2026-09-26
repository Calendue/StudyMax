import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useDragControls, useReducedMotion } from 'motion/react'
import { Icon } from './Icon.tsx'
import { DUR, INSTANT, SPRING } from './motion.ts'

/**
 * A bottom sheet. The top carries a drag handle in the middle and a close cross on the LEFT: the
 * handle alone only hints at a gesture to someone who already knows it, so the cross is always the
 * first thing the eye and the thumb reach. Dragging the handle down past a threshold dismisses it.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  tall,
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  children: ReactNode
  footer?: ReactNode
  /** Full height, for search and long lists, so results don't resize the sheet as they change. */
  tall?: boolean
}) {
  const drag = useDragControls()
  const reduce = useReducedMotion()
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="scrim"
          className="scrim"
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={reduce ? INSTANT : { duration: DUR.med }}
        />
      )}
      {open && (
        <motion.div
          key="sheet"
          className={`sheet${tall ? ' sheet--tall' : ''}`}
          role="dialog"
          aria-modal="true"
          initial={reduce ? false : { y: '100%' }}
          animate={{ y: 0, transition: reduce ? INSTANT : { duration: DUR.med, ease: SPRING } }}
          exit={{ y: '100%', transition: reduce ? INSTANT : { duration: 0.2, ease: 'easeIn' } }}
          drag="y"
          dragControls={drag}
          dragListener={false}
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={{ top: 0, bottom: 0.7 }}
          onDragEnd={(_, info) => {
            if (info.offset.y > 96 || info.velocity.y > 600) onClose()
          }}
        >
          <div className="sheet__top" onPointerDown={(e) => drag.start(e)}>
            <button type="button" className="icon-btn sheet__close" aria-label="Close" onClick={onClose}>
              <Icon name="close" />
            </button>
            <span className="sheet__handle" aria-hidden />
          </div>
          <h2 className="sheet__title">{title}</h2>
          <div className="sheet__body">{children}</div>
          {footer && <div className="sheet__footer">{footer}</div>}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
