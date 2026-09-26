import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { StatusBar, Style } from '@capacitor/status-bar'
import { Mark } from '../ui/Brand.tsx'
import { prefersReducedMotion } from '../ui/motion.ts'
import { hideSplash, isNative } from '../platform.ts'
import { PrismCanvas } from './PrismCanvas.tsx'

// The launch, after CalenDue's prism splash, in StudyMax's palette. The native launch screen is flat
// jet navy, which is exactly this component's first frame, so the hand-off can't be seen. Then sheets
// of light sweep in on the diagonal (Cherry Rose, Rosy Taupe and Old Lace, with crisp bright edges,
// over a deep Ultrasonic Blue glow), and the S ignites in the middle: its shape arrives first as a
// faint silhouette, then Old Lace blooms outward from its centre with a soft halo. The S appears
// exactly once, here, so it never blinks between the native screens and this one.
//
// The field is one canvas (PrismCanvas); the S is transform, opacity and a clip on one 176px element.
// Under reduced motion nothing travels: the finished frame holds for a moment and dissolves. The web has no
// native launch to hand over from, so it starts straight on the page.

const HOLD_MS = 2500
const HOLD_REDUCED_MS = 600

function statusBarOverNavy(on: boolean) {
  // Light icons over the navy; back to dark icons over the Old Lace app.
  void StatusBar.setStyle({ style: on ? Style.Dark : Style.Light }).catch(() => {})
}

export function Intro() {
  const [shown, setShown] = useState(isNative)

  useEffect(() => {
    // Release the native splash only once the intro's first frame is on screen: two animation frames
    // after mount. Hiding it any earlier fades into a web view that hasn't painted yet, a pale flash.
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => hideSplash())
    })
    return () => cancelAnimationFrame(frame)
  }, [])

  useEffect(() => {
    if (!shown) return
    statusBarOverNavy(true)
    const id = setTimeout(() => setShown(false), prefersReducedMotion() ? HOLD_REDUCED_MS : HOLD_MS)
    return () => clearTimeout(id)
  }, [shown])

  return (
    <AnimatePresence onExitComplete={() => statusBarOverNavy(false)}>
      {shown && (
        <motion.div
          key="intro"
          className="intro"
          aria-hidden
          exit={{ opacity: 0, transition: { duration: 0.45, ease: 'easeIn' } }}
        >
          <PrismCanvas />
          <motion.div
            className="intro__icon"
            exit={{ scale: 1.08, opacity: 0, transition: { duration: 0.45, ease: 'easeIn' } }}
          >
            <span className="intro__halo" />
            <Mark size={176} className="intro__silhouette" />
            <Mark size={176} className="intro__mark" />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
