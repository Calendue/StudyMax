import { useEffect, useRef } from 'react'
import { prefersReducedMotion } from '../ui/motion.ts'

// The prism field behind the launch S, drawn on one canvas. Jet navy ground; a deep Ultrasonic Blue
// glow top left and a Cherry Rose glow bottom right; sheets of light on the diagonal (Cherry Rose,
// Rosy Taupe and Old Lace), each brightening toward one crisp edge, sweeping in from the top left and
// then drifting on slowly: the wave.
//
// A canvas rather than CSS layers: WebKit only rasterises part of a very large animated layer, so
// oversized gradient layers came out clipped. Here every frame is one full-screen paint, at no more
// than 2x density so a mid-range phone keeps up. Under reduced motion it paints the settled frame once.

const INK = '#12262B'

interface Sheet {
  /** Where the crisp edge ends up, along the band's normal, as a fraction of the screen diagonal
   *  measured from the centre: negative is toward the top left. */
  to: number
  /** How far back along the normal it starts. */
  travel: number
  /** Width of the band behind its edge, as a fraction of the diagonal. */
  width: number
  delay: number
  /** Body colour and edge colour, as r,g,b; the edge is the bright line. */
  body: string
  edge: string
  bodyAlpha: number
  edgeAlpha: number
}

const SHEETS: Sheet[] = [
  { to: -0.2, travel: 0.55, width: 0.2, delay: 0, body: '152,38,73', edge: '224,132,154', bodyAlpha: 0.6, edgeAlpha: 0.95 },
  { to: -0.3, travel: 0.5, width: 0.06, delay: 0.22, body: '255,248,235', edge: '255,248,235', bodyAlpha: 0.2, edgeAlpha: 1 },
  // Its edge settles just below and right of the S, never behind it.
  { to: 0.1, travel: 0.6, width: 0.16, delay: 0.12, body: '195,141,148', edge: '255,234,228', bodyAlpha: 0.42, edgeAlpha: 0.95 },
  { to: 0.26, travel: 0.5, width: 0.24, delay: 0.05, body: '152,38,73', edge: '214,110,136', bodyAlpha: 0.55, edgeAlpha: 0.85 },
  { to: 0.36, travel: 0.45, width: 0.035, delay: 0.3, body: '255,248,235', edge: '255,248,235', bodyAlpha: 0.16, edgeAlpha: 0.85 },
]

// Band lines run bottom left to top right; this is their normal.
const NX = 0.848
const NY = 0.53

const easeOut = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3)

export function PrismCanvas() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const w = window.innerWidth
    const h = window.innerHeight
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
    ctx.scale(dpr, dpr)
    const diag = Math.hypot(w, h)
    const reduce = prefersReducedMotion()
    const start = performance.now()

    function glow(x: number, y: number, radius: number, rgb: string, alpha: number) {
      const g = ctx!.createRadialGradient(x, y, 0, x, y, radius)
      g.addColorStop(0, `rgba(${rgb},${alpha})`)
      g.addColorStop(0.55, `rgba(${rgb},${alpha * 0.3})`)
      g.addColorStop(1, `rgba(${rgb},0)`)
      ctx!.fillStyle = g
      ctx!.fillRect(0, 0, w, h)
    }

    function draw(now: number) {
      const t = reduce ? 3 : (now - start) / 1000
      ctx!.globalCompositeOperation = 'source-over'
      ctx!.globalAlpha = 1
      ctx!.fillStyle = INK
      ctx!.fillRect(0, 0, w, h)

      const rise = easeOut(t / 1.2)
      glow(w * 0.02, h * 0.04, diag * 0.62, '9,33,215', 0.45 * rise)
      glow(w * 0.98, h * 0.96, diag * 0.6, '152,38,73', 0.75 * rise)

      // Light adds to the dark ground, the way the prism's does.
      ctx!.globalCompositeOperation = 'screen'
      for (const s of SHEETS) {
        const local = t - s.delay
        if (local <= 0) continue
        // Sweep in over the first ~1.1s, then keep drifting on slowly.
        const sweep = easeOut(local / 1.1)
        const offset = (s.to - s.travel * (1 - sweep) + 0.012 * Math.max(0, local - 1.1)) * diag
        const ex = w / 2 + NX * offset
        const ey = h / 2 + NY * offset
        const back = s.width * diag
        const g = ctx!.createLinearGradient(ex - NX * back, ey - NY * back, ex + NX * 1.5, ey + NY * 1.5)
        g.addColorStop(0, `rgba(${s.body},0)`)
        g.addColorStop(0.7, `rgba(${s.body},${s.bodyAlpha * 0.6})`)
        g.addColorStop(0.97, `rgba(${s.edge},${s.edgeAlpha})`)
        g.addColorStop(0.985, `rgba(${s.edge},${s.edgeAlpha})`)
        g.addColorStop(1, `rgba(${s.edge},0)`)
        ctx!.globalAlpha = Math.min(1, local / 0.35)
        ctx!.fillStyle = g
        ctx!.fillRect(0, 0, w, h)
      }

      // Keep the edges in navy so the light reads as coming from the middle.
      ctx!.globalCompositeOperation = 'source-over'
      ctx!.globalAlpha = 1
      const v = ctx!.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, diag * 0.6)
      v.addColorStop(0, 'rgba(10,22,25,0)')
      v.addColorStop(1, 'rgba(10,22,25,0.6)')
      ctx!.fillStyle = v
      ctx!.fillRect(0, 0, w, h)
    }

    if (reduce) {
      draw(start)
      return
    }
    let frame = requestAnimationFrame(function loop(now) {
      draw(now)
      frame = requestAnimationFrame(loop)
    })
    return () => cancelAnimationFrame(frame)
  }, [])

  return <canvas ref={ref} className="intro__canvas" aria-hidden />
}
