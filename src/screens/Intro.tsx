import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, animate, motion, useMotionValue, useTransform } from 'motion/react'
import { Mark } from '../ui/Brand.tsx'
import { prefersReducedMotion } from '../ui/motion.ts'
import { hideSplash, isNative } from '../platform.ts'

// The launch splash, ported from CalenDue's (mobile/components/splash/PrismStage.tsx and
// PrismVideo.tsx) as it is: the same Prism shader, played back from a video rendered at the same
// preset (scripts/launch/prism), the same beat, and the mark igniting in the middle of it the same
// way. Only the colours are StudyMax's: an Old Lace ground, Cherry Rose and jet navy in the shader,
// the Cherry Rose S as the mark, and the halo and silhouette tints taken from the same palette.
//
// One addition, the hand-over: at the light's peak the app's first screen mounts underneath and
// the splash crossfades into it while the light keeps moving (the video runs on past the peak), so
// the animation never stops dead before the app appears.
//
// The beat, on the shader's own clock:
//
//   0.00 s  flat Old Lace across every pixel. Identical to the native launch screen, which is what
//           makes the hand-off invisible.
//   0.85 s  the first blade of light enters from the top-right.
//   1.50 s  IGNITION: the mark appears as an unlit silhouette, the shape present but not yet alive.
//   1.65 s  the colour blooms outward from the centre of the mark and fills it, with a soft halo
//           that swells and settles.
//   2.45 s  filled.
//   3.20 s  the light is at its peak. The app mounts underneath and the splash crossfades into it.
//
// Under reduced motion none of this runs: the peak frame is held still and the finished mark
// dissolves in over it. The web has no native launch to hand over from, so it starts on the page.

/** Milliseconds from the launch clock. */
const PRISM = {
  IGNITE_AT: 1500,
  IGNITE_MS: 320,
  FILL_AFTER: 150,
  FILL_MS: 800,
  TOTAL: 3200,
  STALL_GRACE_MS: 2500,
  FLAT_LEAD: 850,
} as const

/** Points. The mark is padded inside its own square, so this is generous. */
const MARK_SIZE = 168
/** CalenDue's EASE. */
const EASE = [0.22, 1, 0.36, 1] as const
/** The crossfade into the app: long enough to read as one move, with the light still travelling. */
const DISSOLVE_S = 0.7
const DISSOLVE_EASE = [0.45, 0, 0.55, 1] as const

/** `onReveal` fires as the splash starts to dissolve: the moment to mount the app beneath it. */
export function Intro({ onReveal }: { onReveal: () => void }) {
  const [shown, setShown] = useState(isNative)
  const reveal = () => {
    onReveal()
    setShown(false)
  }

  useEffect(() => {
    // Release the native launch screen once this component's first frame is on screen.
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => hideSplash())
    })
    return () => cancelAnimationFrame(frame)
  }, [])

  return (
    <AnimatePresence>
      {shown && (
        <motion.div
          key="intro"
          className="prism"
          aria-hidden
          exit={{ opacity: 0, transition: { duration: DISSOLVE_S, ease: DISSOLVE_EASE } }}
        >
          <PrismStage onAnimationDone={reveal} />
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function PrismStage({ onAnimationDone }: { onAnimationDone: () => void }) {
  const reduceMotion = prefersReducedMotion()
  const reported = useRef(false)
  // Held in a ref: the parent re-renders while the app starts (account, feature flags), and a new
  // callback identity must never restart the ignition or re-seek the video.
  const done = useRef(onAnimationDone)
  done.current = onAnimationDone
  const reachedStop = useCallback(() => {
    if (reported.current) return
    reported.current = true
    done.current()
  }, [])

  // The animation always starts past its flat opening: those frames are the single colour the
  // native launch screen has been showing since the icon was tapped.
  const startAt = PRISM.FLAT_LEAD

  // One shared clock for both layers: 0 at ignition, 1 when the fill is complete.
  const ignite = useMotionValue(0)
  const fill = useMotionValue(0)

  useEffect(() => {
    const igniteIn = Math.max(0, PRISM.IGNITE_AT - startAt) / 1000
    const doneIn = Math.max(0, PRISM.TOTAL - startAt)
    const controls = reduceMotion
      ? [
          animate(ignite, 1, { duration: 0.32, delay: igniteIn, ease: EASE }),
          animate(fill, 1, { duration: 0.32, delay: igniteIn, ease: EASE }),
        ]
      : [
          animate(ignite, 1, { duration: PRISM.IGNITE_MS / 1000, delay: igniteIn, ease: EASE }),
          animate(fill, 1, {
            duration: PRISM.FILL_MS / 1000,
            delay: igniteIn + PRISM.FILL_AFTER / 1000,
            ease: EASE,
          }),
        ]
    // The animation's own end is reported by the player; this is only the backstop, so a decoder
    // that never starts can't strand anyone on the splash. With no player (reduced motion) the end
    // is the animation's own length.
    const timer = setTimeout(reachedStop, reduceMotion ? doneIn : doneIn + PRISM.STALL_GRACE_MS)
    return () => {
      clearTimeout(timer)
      controls.forEach((c) => c.stop())
    }
  }, [reduceMotion, ignite, fill, reachedStop, startAt])

  // The unlit shape. It never reaches full strength on its own; the colour layer completes it.
  const silhouetteOpacity = useTransform(() => ignite.get() * 0.34 * (1 - 0.65 * fill.get()))
  // The mark settles the last few percent as it lights.
  const markScale = useTransform(ignite, [0, 1], [reduceMotion ? 1 : 1.05, 1])
  // The bloom: an opaque core with a soft rim, grown from nothing to well past the mark's bounds.
  // Zero, not "small": a small bloom still shows a bright dot at the centre of the mark.
  const bloomOpacity = useTransform(fill, (v) => (v > 0 ? 1 : 0))
  const bloomSize = useTransform(fill, (v) => `${v * 310}% ${v * 310}%`)
  // Light spilling off the mark as it lights, swelling with the fill and settling back.
  const haloOpacity = useTransform(fill, [0, 0.5, 1], reduceMotion ? [0, 0, 0] : [0, 0.34, 0.12])
  const haloScale = useTransform(fill, [0, 1], [0.65, 1.25])

  return (
    <div className="prism__root">
      {reduceMotion ? (
        <img className="prism__field" src="/splash/prism-still.jpg" alt="" />
      ) : (
        <PrismVideo startAt={startAt / 1000} stopAt={PRISM.TOTAL / 1000} onReachedStop={reachedStop} />
      )}

      <div className="prism__centre">
        <motion.div className="prism__box" style={{ width: MARK_SIZE, height: MARK_SIZE, scale: markScale }}>
          <motion.div className="prism__halo" style={{ opacity: haloOpacity, scale: haloScale }} />
          {/* Unlit. */}
          <motion.div className="prism__layer prism__silhouette" style={{ opacity: silhouetteOpacity }}>
            <Mark size={MARK_SIZE} />
          </motion.div>
          {/* Lit: the mark's own colour, revealed by the bloom. */}
          <motion.div
            className="prism__layer prism__lit"
            style={{ opacity: bloomOpacity, WebkitMaskSize: bloomSize, maskSize: bloomSize }}
          >
            <Mark size={MARK_SIZE} />
          </motion.div>
        </motion.div>
      </div>
    </div>
  )
}

/** The Prism gradient, played back rather than computed on the device. */
function PrismVideo({
  startAt,
  stopAt,
  onReachedStop,
}: {
  startAt: number
  /** Seconds into the animation at which the splash has done its job. */
  stopAt: number
  onReachedStop: () => void
}) {
  const ref = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const video = ref.current
    if (!video) return
    let sought = false
    // The splash ends where the ANIMATION ends, measured against playback, not a wall clock.
    const onTime = () => {
      if (video.currentTime >= stopAt) onReachedStop()
    }
    // Skip the flat opening the native launch screen already showed. The seek waits for the
    // video to be ready: setting currentTime before then is dropped silently.
    const seek = () => {
      if (video.currentTime >= stopAt) {
        onReachedStop()
        return
      }
      if (video.readyState < HTMLMediaElement.HAVE_METADATA) return
      if (!sought) {
        sought = true
        if (startAt > 0) video.currentTime = startAt
      }
      void video.play().catch(() => {})
    }
    video.addEventListener('loadedmetadata', seek)
    video.addEventListener('canplay', seek)
    video.addEventListener('timeupdate', onTime)
    video.addEventListener('ended', onReachedStop)
    seek()
    return () => {
      video.removeEventListener('loadedmetadata', seek)
      video.removeEventListener('canplay', seek)
      video.removeEventListener('timeupdate', onTime)
      video.removeEventListener('ended', onReachedStop)
    }
  }, [startAt, stopAt, onReachedStop])

  return (
    <video
      ref={ref}
      className="prism__field"
      src="/splash/prism-splash.mp4"
      muted
      playsInline
      preload="auto"
      disableRemotePlayback
    />
  )
}
