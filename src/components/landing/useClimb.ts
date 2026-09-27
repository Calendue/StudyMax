import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { BEATS } from './beats.ts'
import { growClimb, type Box, type ClimbGeometry, type Stop, type Target } from './geometry.ts'

// The climb: the landing page opens at the roots and you scroll UP. This hook owns everything that
// has to know where things are: the scroller, keeping the view pinned to the roots while the page
// settles, measuring the story cards (once, and on resize — never while scrolling) so the tree can
// be grown to fit them, which beats have grown and which are on screen, and the presenter's keys.

const COMPACT = 768

function scrollerOf(el: HTMLElement): HTMLElement {
  return (el.closest('.screen__body') as HTMLElement | null) ?? (document.scrollingElement as HTMLElement)
}

/** An element's box in the stage's own coordinates, ignoring transforms (cards settle in with them). */
function boxIn(el: HTMLElement, root: HTMLElement): Box {
  let x = 0
  let y = 0
  let node: HTMLElement | null = el
  while (node && node !== root) {
    x += node.offsetLeft
    y += node.offsetTop
    node = node.offsetParent as HTMLElement | null
  }
  return { x, y, w: el.offsetWidth, h: el.offsetHeight }
}

interface Measured {
  geometry: ClimbGeometry
  /** Each beat's focus point: the height the presenter's keys centre on. */
  centres: number[]
  /** Where the dusk sky meets the page. */
  dusk: number
}

function measure(stage: HTMLElement): Measured | null {
  const width = stage.clientWidth
  const height = stage.offsetHeight
  if (width === 0 || height === 0) return null
  const compact = width < COMPACT
  const sections = [...stage.querySelectorAll<HTMLElement>('[data-beat]')]
  const beatOf = (el: HTMLElement) => Number(el.closest<HTMLElement>('[data-beat]')?.dataset.beat ?? 0)
  const targets = (selector: string): Target[] =>
    [...stage.querySelectorAll<HTMLElement>(selector)].map((el, i) => ({ key: el.dataset.key ?? `${selector}-${i}`, beat: beatOf(el), box: boxIn(el, stage) }))

  const groundEl = stage.querySelector<HTMLElement>('[data-ground]')
  const duskEl = stage.querySelector<HTMLElement>('[data-dusk]')
  const bandEl = stage.querySelector<HTMLElement>('[data-band]')
  const crownEl = stage.querySelector<HTMLElement>('[data-crown]')
  if (!groundEl || !duskEl || !crownEl) return null
  const groundBox = boxIn(groundEl, stage)
  const ground = groundBox.y + groundBox.h
  const duskBox = boxIn(duskEl, stage)
  const bandBox = bandEl ? boxIn(bandEl, stage) : null
  const crownBox = boxIn(crownEl, stage)

  const xAt = (i: number) => (compact ? width - 24 - 3 * Math.sin(i * 1.9) : BEATS[i].trunk * width)
  const anchors = sections.map((s) => boxIn(s.querySelector<HTMLElement>('[data-anchor]') ?? s, stage))
  const centres = anchors.map((a) => a.y + a.h / 2)
  // The trunk stands upright beside each beat's cards and only leans in the open air between beats.
  const stops: Stop[] = [{ x: xAt(0), y: ground }, { x: xAt(0), y: anchors[0].y + (compact ? 0 : anchors[0].h * 0.3) }]
  anchors.forEach((a, i) => {
    if (i === 0 || i === anchors.length - 1) return
    // A cluster (cards either side of the trunk) holds it upright; a single card lets it lean past.
    if (sections[i].querySelector('[data-anchor][data-upright]')) {
      const inset = Math.min(a.h / 2 - 1, compact ? 10 : 60)
      stops.push({ x: xAt(i), y: a.y + a.h - inset }, { x: xAt(i), y: a.y + inset })
    } else stops.push({ x: xAt(i), y: a.y + a.h / 2 })
  })
  stops.push({ x: compact ? xAt(anchors.length - 1) : crownBox.x + crownBox.w / 2, y: crownBox.y + crownBox.h / 2 })
  // The trunk only ever climbs: drop a stop that isn't above the one before it.
  const climbing = stops.filter((s, i) => i === 0 || s.y < stops[i - 1].y - 8)

  const chain = targets('[data-chain]').sort(
    (a, b) =>
      Number(stage.querySelector<HTMLElement>(`[data-key="${a.key}"]`)?.dataset.chain) -
      Number(stage.querySelector<HTMLElement>(`[data-key="${b.key}"]`)?.dataset.chain),
  )
  const beatTops = anchors.map((a) => a.y)
  // The sky covers the canopy section, down to just under the crown.
  const dusk = duskBox.y + duskBox.h + Number(duskEl.dataset.dusk || 0)
  const geometry = growClimb({
    width,
    height,
    compact,
    ground,
    dusk,
    band: bandBox ? { top: bandBox.y - (compact ? 40 : 96), bottom: bandBox.y + bandBox.h + (compact ? 40 : 96) } : null,
    stops: climbing,
    twigs: targets('[data-twig]'),
    blossoms: targets('[data-blossom]'),
    chain,
    beatTops,
    masks: [...stage.querySelectorAll<HTMLElement>('[data-mask]')].map((el) => boxIn(el, stage)),
  })
  return { geometry, centres, dusk }
}

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

export interface Climb {
  scrollerRef: RefObject<HTMLElement | null>
  geometry: ClimbGeometry | null
  /** The highest beat grown so far (growth only ever goes up). */
  grown: number
  /** Beats on screen now: only their arrows pulse. */
  live: Set<number>
  /** The camera's horizontal offset for a scroll position. */
  panAt: (scrollTop: number) => number
  /** Where the dusk sky ends, in scroll terms, for the bar to change colour. */
  duskAt: number
  go: (beat: number) => void
}

export function useClimb(stageRef: RefObject<HTMLDivElement | null>, reduce: boolean): Climb {
  const scrollerRef = useRef<HTMLElement | null>(null)
  const [measured, setMeasured] = useState<Measured | null>(null)
  const measuredRef = useRef<Measured | null>(null)
  measuredRef.current = measured
  const [grown, setGrown] = useState(reduce ? BEATS.length - 1 : -1)
  const [live, setLive] = useState<Set<number>>(() => new Set([0]))

  // Distance from the bottom, kept while the page settles (fonts, the screen's entrance), so the
  // view stays on the roots until the visitor climbs.
  const fromBottom = useRef(0)
  const maxScroll = useRef(0)
  const tween = useRef<{ raf: number; target: number } | null>(null)

  // ── before first paint: find the scroller, open at the roots, and keep them pinned ──
  useLayoutEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const scroller = scrollerOf(stage)
    scrollerRef.current = scroller
    const restoration = history.scrollRestoration
    history.scrollRestoration = 'manual'
    const settle = () => {
      maxScroll.current = scroller.scrollHeight - scroller.clientHeight
      scroller.scrollTop = maxScroll.current - fromBottom.current
    }
    fromBottom.current = 0
    settle()
    setMeasured(measure(stage))
    let width = stage.clientWidth
    const observer = new ResizeObserver(() => {
      settle()
      if (stage.clientWidth !== width || !measuredRef.current || Math.abs(measuredRef.current.geometry.height - stage.offsetHeight) > 1) {
        width = stage.clientWidth
        setMeasured(measure(stage))
      }
    })
    observer.observe(stage)
    observer.observe(scroller)
    const onScroll = () => {
      fromBottom.current = Math.max(0, maxScroll.current - scroller.scrollTop)
    }
    scroller.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      observer.disconnect()
      scroller.removeEventListener('scroll', onScroll)
      history.scrollRestoration = restoration
    }
  }, [stageRef])

  // A re-measure (a resize) can move the page under the view; put the roots back where they were.
  useLayoutEffect(() => {
    const scroller = scrollerRef.current
    if (!scroller || !measured) return
    maxScroll.current = scroller.scrollHeight - scroller.clientHeight
    scroller.scrollTop = maxScroll.current - fromBottom.current
  }, [measured])

  // ── growth and the live arrows: which beats have come into view, and which are on screen ──
  useEffect(() => {
    const stage = stageRef.current
    const scroller = scrollerRef.current
    if (!stage || !scroller || !measured) return
    const root = scroller === document.scrollingElement ? null : scroller
    if (!reduce) {
      // The roots grow as soon as the page is up.
      const first = requestAnimationFrame(() => setGrown((g) => Math.max(g, 0)))
      const anchors = [...stage.querySelectorAll<HTMLElement>('[data-beat]')].map((s) => s.querySelector<HTMLElement>('[data-anchor]') ?? s)
      const grow = new IntersectionObserver(
        (entries) => {
          const seen = entries.filter((e) => e.isIntersecting).map((e) => Number((e.target as HTMLElement).closest<HTMLElement>('[data-beat]')!.dataset.beat))
          if (seen.length > 0) setGrown((g) => Math.max(g, ...seen))
        },
        { root, rootMargin: '-14% 0px -14% 0px' },
      )
      anchors.forEach((a) => grow.observe(a))
      const onScreen = new IntersectionObserver(
        (entries) => {
          setLive((prev) => {
            const next = new Set(prev)
            for (const e of entries) {
              const beat = Number((e.target as HTMLElement).dataset.beat)
              if (e.isIntersecting) next.add(beat)
              else next.delete(beat)
            }
            return next
          })
        },
        { root },
      )
      stage.querySelectorAll<HTMLElement>('[data-beat]').forEach((s) => onScreen.observe(s))
      return () => {
        cancelAnimationFrame(first)
        grow.disconnect()
        onScreen.disconnect()
      }
    }
  }, [stageRef, measured, reduce])

  // ── the camera: it drifts with the trunk, so the tree glides across the screen as you climb ──
  const panAt = useCallback((scrollTop: number) => {
    const m = measuredRef.current
    const scroller = scrollerRef.current
    if (!m || !scroller || m.geometry.compact) return 0
    const { stops, width } = m.geometry
    const y = scrollTop + scroller.clientHeight / 2
    // stops run bottom to top, so y falls along them
    let x = stops[0].x
    if (y <= stops[stops.length - 1].y) x = stops[stops.length - 1].x
    else
      for (let i = 0; i < stops.length - 1; i++) {
        const a = stops[i]
        const b = stops[i + 1]
        if (y <= a.y && y >= b.y) {
          const t = (a.y - y) / (a.y - b.y)
          x = a.x + (b.x - a.x) * t * t * (3 - 2 * t)
          break
        }
      }
    return Math.round((width / 2 - x) * 0.14 * 10) / 10
  }, [])

  // ── the presenter's keys: a clicker's Next goes up the tree, beat by beat ──
  const go = useCallback(
    (beat: number) => {
      const scroller = scrollerRef.current
      const m = measuredRef.current
      if (!scroller || !m) return
      const last = m.centres.length - 1
      const index = Math.max(0, Math.min(last, beat))
      const max = scroller.scrollHeight - scroller.clientHeight
      const target =
        index === 0 ? max : index === last ? 0 : Math.max(0, Math.min(max, m.centres[index] - scroller.clientHeight / 2))
      if (tween.current) cancelAnimationFrame(tween.current.raf)
      if (reduce) {
        tween.current = null
        scroller.scrollTop = target
        return
      }
      const from = scroller.scrollTop
      const distance = target - from
      const duration = Math.min(1500, 650 + Math.abs(distance) * 0.35)
      const start = performance.now()
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / duration)
        scroller.scrollTop = from + distance * easeInOut(t)
        if (t < 1 && tween.current) tween.current.raf = requestAnimationFrame(step)
        else tween.current = null
      }
      tween.current = { raf: requestAnimationFrame(step), target: index }
    },
    [reduce],
  )

  useEffect(() => {
    const scroller = scrollerRef.current
    if (!scroller) return
    const current = () => {
      if (tween.current) return tween.current.target
      const m = measuredRef.current
      if (!m) return 0
      const max = scroller.scrollHeight - scroller.clientHeight
      const mid = scroller.scrollTop + scroller.clientHeight / 2
      if (scroller.scrollTop >= max - 4) return 0
      if (scroller.scrollTop <= 4) return m.centres.length - 1
      let best = 0
      m.centres.forEach((c, i) => {
        if (Math.abs(c - mid) < Math.abs(m.centres[best] - mid)) best = i
      })
      return best
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return
      const target = e.target as HTMLElement | null
      if (target?.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')) return
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return
      let next: number | null = null
      if (e.key === 'PageDown' || e.key === 'ArrowRight') next = current() + 1
      else if (e.key === 'PageUp' || e.key === 'ArrowLeft') next = current() - 1
      else if (e.key === ' ') {
        if (target?.closest('button, a, summary, [role="button"]')) return
        next = current() + (e.shiftKey ? -1 : 1)
      } else if (e.key === 'Home') next = 0
      else if (e.key === 'End') next = BEATS.length - 1
      if (next === null) return
      e.preventDefault()
      go(next)
    }
    // A wheel, a touch or a drag takes the scroll back from a glide in progress.
    const interrupt = () => {
      if (tween.current) {
        cancelAnimationFrame(tween.current.raf)
        tween.current = null
      }
    }
    window.addEventListener('keydown', onKey)
    scroller.addEventListener('wheel', interrupt, { passive: true })
    scroller.addEventListener('touchstart', interrupt, { passive: true })
    return () => {
      window.removeEventListener('keydown', onKey)
      scroller.removeEventListener('wheel', interrupt)
      scroller.removeEventListener('touchstart', interrupt)
      interrupt()
    }
  }, [go])

  return { scrollerRef, geometry: measured?.geometry ?? null, grown: reduce ? BEATS.length - 1 : grown, live, panAt, duskAt: measured?.dusk ?? 0, go }
}
