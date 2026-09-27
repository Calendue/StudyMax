import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { electiveLabel, isElective } from '../lib/plan.ts'
import { createPortal } from 'react-dom'
import { useReducedMotion } from 'motion/react'
import { useModel } from '../model.ts'
import { courseCode, KIND_LABEL } from '../format.ts'
import { haptic } from '../platform.ts'
import { laneSeason, layoutSkillTree, pathThrough, type SkillTreeLayout, type TreeMilestone, type TreeNode } from '../lib/skillTree.ts'
import { Icon } from '../ui/Icon.tsx'
import { Sheet } from '../ui/Sheet.tsx'
import { useTreeInputs, type TreeSelection } from './planView.ts'
import { DegreeReadout } from './DegreeReadout.tsx'
import { PlanIssues } from '../ui/WhatChanged.tsx'
import { TreeDetail } from './TreeDetail.tsx'
import { TreePeek } from './TreePeek.tsx'
import './skilltree.css'

// The first time the tree opens in a session it grows; after that it's simply there.
let grownThisSession = false

const LEGEND: { key: string; label: string }[] = [
  { key: 'completed', label: 'Done' },
  { key: 'inProgress', label: 'Taking now' },
  { key: 'next', label: 'Take next' },
  { key: 'planned', label: 'Planned' },
  { key: 'elective', label: 'Elective' },
  { key: 'locked', label: 'Locked' },
  { key: 'link', label: 'Unlocks' },
]

/** The page's scrolling element: the phone's screen body, or the desktop shell's page. */
function scrollerOf(el: HTMLElement): HTMLElement {
  return (el.closest('.tree--contained .tree__scroll, .screen__body, .shell__page') as HTMLElement | null) ?? (document.scrollingElement as HTMLElement)
}

/** "Certificate in Astronomy" → "Astronomy", "Statistics Minor" → "Statistics": the kind goes on its own line. */
function shortName(name: string): string {
  const short = name.replace(/^(Certificate|Minor) in /i, '').replace(/ (Certificate|Minor)$/i, '')
  return short.length > 0 ? short : name
}

function hueVar(cred: number | undefined): string {
  return cred === undefined ? 'var(--tree-planned)' : `var(--tree-cred-${cred + 1})`
}

/**
 * The Academic Skill Tree: the degree as a tree that grows up from the roots, Fall on the left of
 * the trunk and Winter on the right, into a canopy of the credentials being worked toward.
 * It opens at the roots and you scroll UP to grow. Layout lives in src/lib/skillTree.ts; this draws
 * it and owns the interaction.
 *
 * `dock`, when given, is where the details of the selected course go (the desktop's side panel);
 * otherwise a tap shows a slim peek over the tab bar (TreePeek), with the full sheet one tap away.
 */
export function SkillTree({
  dock,
  bleed = false,
  stickyTop = 0,
  contained = false,
}: {
  dock?: HTMLElement | null
  bleed?: boolean
  stickyTop?: number
  /** Scroll the tree inside its own box (the desktop page), so the page's header stays put. */
  contained?: boolean
}) {
  const m = useModel()
  const reduce = useReducedMotion() ?? false
  const inputs = useTreeInputs()

  const sectionRef = useRef<HTMLElement>(null)
  const boardRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = boardRef.current
    if (!el) return
    setWidth(el.clientWidth)
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const layout = useMemo<SkillTreeLayout | null>(
    () =>
      width > 0
        ? layoutSkillTree({
            // After the student's overrides: a failed course isn't done, a dropped one isn't under way.
            completed: m.planCompleted,
            inProgress: m.planInProgress,
            plan: m.plan,
            ...inputs,
            internshipYear: m.internshipYear,
            width,
          })
        : null,
    [m.planCompleted, m.planInProgress, m.plan, m.internshipYear, inputs, width],
  )

  const [selection, setSelection] = useState<TreeSelection | null>(null)
  // Phones: a tap shows the slim peek over the tab bar; Details opens the full sheet.
  const [sheetOpen, setSheetOpen] = useState(false)
  // Phones fold the key away: the cards already say Done, Now, Next, Needs and Elective.
  const [keyOpen, setKeyOpen] = useState(false)
  const [credFilter, setCredFilter] = useState<number | null>(null)
  // A selection that stops resolving (the course was un-ticked, a target dropped) clears itself.
  const selectedNode = selection?.kind === 'node' ? layout?.nodes.find((n) => n.code === selection.code) : undefined
  const selectedLeaf = selection?.kind === 'leaf' ? layout?.leaves[selection.index] : undefined
  const live = selectedNode ?? selectedLeaf ? selection : null

  const focus = useMemo(() => {
    if (!layout) return null
    if (live?.kind === 'node') return pathThrough(layout, live.code)
    const cred = live?.kind === 'leaf' ? live.index : credFilter
    if (cred === null || cred === undefined) return null
    const leaf = layout.leaves[cred]
    return leaf ? { codes: new Set(leaf.codes), creds: new Set([cred]) } : null
  }, [layout, live, credFilter])

  // The chosen course's own links, the same ones its Prerequisites and Unlocks list: arrows in from
  // what it needs, arrows out to what it opens (the rest of the chain stays lit, without lines). The
  // signal runs in along the prerequisites first, then out, so it reads as flowing up the tree.
  const focusLinks = useMemo(() => {
    if (!layout || live?.kind !== 'node') return []
    return layout.links
      .filter((l) => l.to === live.code || l.from === live.code)
      .map((l) => ({ ...l, delay: l.to === live.code ? 0 : 1300 }))
  }, [layout, live])

  const ready = layout !== null

  // ── the upward scroll: open at the roots, and stay pinned to them through resizes ──
  const fromBottom = useRef(0)
  const [scrolledUp, setScrolledUp] = useState(false)
  const [awayFromRoots, setAwayFromRoots] = useState(false)
  const boardBottomIn = (scroller: HTMLElement) => {
    const board = boardRef.current!
    return board.getBoundingClientRect().bottom - scroller.getBoundingClientRect().top + scroller.scrollTop
  }
  const pin = () => {
    const board = boardRef.current
    if (!board) return
    const scroller = scrollerOf(board)
    scroller.scrollTop = Math.max(0, boardBottomIn(scroller) - scroller.clientHeight + 8 - fromBottom.current)
  }
  // Before first paint: the layout is known, so put the roots at the bottom of the view.
  const pinned = useRef(false)
  useLayoutEffect(() => {
    if (!layout) return
    if (!pinned.current) {
      pinned.current = true
      fromBottom.current = 0
    }
    pin()
    // The page around the board can still settle (fonts, the tab's entrance); keep the roots pinned.
    const scroller = scrollerOf(boardRef.current!)
    const observer = new ResizeObserver(() => pin())
    observer.observe(scroller)
    if (scroller.firstElementChild) observer.observe(scroller.firstElementChild)
    return () => observer.disconnect()
    // pin reads refs only
  }, [layout])

  useEffect(() => {
    const board = boardRef.current
    if (!board) return
    const scroller = scrollerOf(board)
    const start = scroller.scrollTop
    const onScroll = () => {
      fromBottom.current = Math.max(0, boardBottomIn(scroller) - scroller.clientHeight + 8 - scroller.scrollTop)
      if (Math.abs(scroller.scrollTop - start) > 24) setScrolledUp(true)
      setAwayFromRoots(fromBottom.current > 260)
    }
    scroller.addEventListener('scroll', onScroll, { passive: true })
    return () => scroller.removeEventListener('scroll', onScroll)
  }, [ready])

  // ── growing: the trunk draws up, then each year pops in as it scrolls into view ──
  const [grow] = useState(() => !grownThisSession && !reduce)
  const [shownBands, setShownBands] = useState<Set<string>>(() => new Set())
  useEffect(() => {
    if (!grow || !layout || !boardRef.current) return
    grownThisSession = true
    const bands = boardRef.current.querySelectorAll<HTMLElement>('[data-band]')
    const observer = new IntersectionObserver(
      (entries) => {
        const seen = entries.filter((e) => e.isIntersecting).map((e) => (e.target as HTMLElement).dataset.band!)
        if (seen.length > 0) setShownBands((prev) => new Set([...prev, ...seen]))
      },
      { rootMargin: '0px 0px -8% 0px' },
    )
    bands.forEach((b) => observer.observe(b))
    return () => observer.disconnect()
  }, [grow, layout])
  const bandShown = (key: string) => !grow || shownBands.has(key)

  const scrollToY = (y: number) => {
    const board = boardRef.current
    if (!board) return
    const scroller = scrollerOf(board)
    const top = board.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop
    scroller.scrollTo({ top: top + y - scroller.clientHeight / 2, behavior: reduce ? 'auto' : 'smooth' })
  }
  const toRoots = () => {
    fromBottom.current = 0
    const board = boardRef.current
    if (!board) return
    const scroller = scrollerOf(board)
    scroller.scrollTo({ top: boardBottomIn(scroller) - scroller.clientHeight + 8, behavior: reduce ? 'auto' : 'smooth' })
  }

  function select(next: TreeSelection | null, scroll = false) {
    if (next) haptic.selection()
    setSelection(next)
    if (!next) setSheetOpen(false)
    if (next && !scroll && !dock) keepClearOfPeek(next)
    if (next && scroll && layout) {
      const target = next.kind === 'node' ? layout.nodes.find((n) => n.code === next.code) : layout.leaves[next.index]
      if (target) scrollToY(target.y + target.h / 2)
      window.setTimeout(() => {
        const key = next.kind === 'node' ? next.code : `leaf-${next.index}`
        boardRef.current?.querySelector<HTMLElement>(`[data-key="${key}"]`)?.focus({ preventScroll: true })
      }, reduce ? 0 : 320)
    }
  }

  // A card tapped low on a phone slides up, clear of the peek that's about to cover the bottom.
  function keepClearOfPeek(next: TreeSelection) {
    const board = boardRef.current
    const key = next.kind === 'node' ? next.code : `leaf-${next.index}`
    const el = board?.querySelector<HTMLElement>(`[data-key="${key}"]`)
    if (!board || !el) return
    const scroller = scrollerOf(board)
    const clear = scroller.getBoundingClientRect().bottom - 230
    const bottom = el.getBoundingClientRect().bottom
    if (bottom > clear) scroller.scrollBy({ top: bottom - clear, behavior: reduce ? 'auto' : 'smooth' })
  }

  // ── keyboard: arrows move between cards, Home and End jump to the roots and the canopy ──
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (!layout) return
    const items = [
      ...layout.nodes.map((n) => ({ key: n.code, x: n.x + n.w / 2, y: n.y + n.h / 2 })),
      ...layout.leaves.map((l) => ({ key: `leaf-${l.index}`, x: l.x + l.w / 2, y: l.y + l.h / 2 })),
    ]
    const focusKey = (key: string) => {
      const el = boardRef.current?.querySelector<HTMLElement>(`[data-key="${key}"]`)
      el?.focus()
      el?.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' })
    }
    if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault()
      const sorted = [...items].sort((a, b) => a.y - b.y)
      const pick = e.key === 'Home' ? sorted[sorted.length - 1] : sorted[0]
      if (pick) focusKey(pick.key)
      if (e.key === 'Home' && !pick) toRoots()
      return
    }
    const dir = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[e.key]
    const current = (document.activeElement as HTMLElement | null)?.dataset.key
    const from = items.find((i) => i.key === current)
    if (!dir || !from) return
    e.preventDefault()
    const [dx, dy] = dir
    const best = items
      .filter((i) => i.key !== from.key && (i.x - from.x) * dx + (i.y - from.y) * dy > 4)
      .map((i) => {
        const along = (i.x - from.x) * dx + (i.y - from.y) * dy
        const across = Math.abs((i.x - from.x) * dy) + Math.abs((i.y - from.y) * dx)
        return { i, score: along + across * 2 }
      })
      .sort((a, b) => a.score - b.score)[0]
    if (best) focusKey(best.i.key)
  }

  const detail = layout && live ? <TreeDetail layout={layout} selection={live} onSelect={(s) => select(s, true)} onChanged={() => setSheetOpen(false)} /> : null
  const detailTitle =
    live?.kind === 'node' ? courseCode(live.code) : live?.kind === 'leaf' && layout ? layout.leaves[live.index]?.name ?? '' : ''

  const classes = ['tree']
  if (bleed) classes.push('tree--bleed')
  if (grow) classes.push('tree--grow')
  if (focus) classes.push('tree--focus')
  if (layout?.compact) classes.push('tree--compact')
  if (contained) classes.push('tree--contained')
  const compact = layout?.compact ?? false
  if (compact && keyOpen) classes.push('tree--key-open')
  const chips = layout && layout.leaves.length > 0 && (
    <div className="tree__chips" role="group" aria-label="Highlight a credential">
      {layout.leaves.map((leaf) => (
        <button
          key={leaf.id}
          type="button"
          className={`tree__chip${credFilter === leaf.index ? ' tree__chip--on' : ''}`}
          style={{ '--hue': hueVar(leaf.index) } as CSSProperties}
          aria-pressed={credFilter === leaf.index}
          onClick={() => {
            haptic.selection()
            setSelection(null)
            setCredFilter((c) => (c === leaf.index ? null : leaf.index))
          }}
        >
          <span className="tree__chip-dot" aria-hidden />
          <span className="tree__chip-name" title={leaf.name}>
            {leaf.kind === 'specialization' ? leaf.name : `${shortName(leaf.name)} ${KIND_LABEL[leaf.kind].toLowerCase()}`}
          </span>
          <span className="tree__chip-count">
            {leaf.done}/{leaf.total}
          </span>
        </button>
      ))}
    </div>
  )

  const peek = !dock && layout && live ? (
    <TreePeek
      layout={layout}
      selection={live}
      title={live.kind === 'node' ? m.courseTitle(live.code) : undefined}
      onSelect={(s) => select(s, true)}
      onDetails={() => setSheetOpen(true)}
      onClose={() => select(null)}
    />
  ) : null

  // Back to roots and Jump to now live in the pinned bar, so they never sit over a card or a trunk
  // milestone. They show once you've climbed away from the roots.
  const jumps = layout && (
    <div className={`tree__jumps${awayFromRoots ? ' is-on' : ''}`} aria-hidden={!awayFromRoots}>
      <button
        type="button"
        className="tree__jump"
        tabIndex={awayFromRoots ? 0 : -1}
        aria-label="Jump to now"
        title="Jump to now"
        onClick={() => {
          const band = layout.bands.find((b) => b.current)
          if (band) scrollToY(band.y + band.h / 2)
        }}
      >
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden>
          <circle cx="8" cy="8" r="5.5" />
          <circle cx="8" cy="8" r="1.6" />
        </svg>
      </button>
      <button type="button" className="tree__jump" tabIndex={awayFromRoots ? 0 : -1} aria-label="Back to roots" title="Back to roots" onClick={toRoots}>
        <svg viewBox="0 0 12 12" width="14" height="14" aria-hidden>
          <path d="M6 2v8M2.5 6.5 6 10l3.5-3.5" />
        </svg>
      </button>
    </div>
  )

  return (
    <section
      ref={sectionRef}
      className={classes.join(' ')}
      aria-label="Academic skill tree"
      style={{ '--tree-sticky-top': `${stickyTop}px` } as CSSProperties}
    >
      <PlanIssues />
      <div className="tree__bar">
        {(!compact || keyOpen) && (
          <ul id="tree-key" className="tree__legend" aria-label="Key">
            {LEGEND.map((k) => (
              <li key={k.key}>
                {k.key === 'link' ? (
                  <svg className="tree__key-arrow" width="10" height="14" viewBox="0 0 10 14" aria-hidden>
                    <path d="M5 13V5" />
                    <path d="M1 6 5 1l4 5Z" />
                  </svg>
                ) : (
                  <span className={`tree__key tree__key--${k.key}`} aria-hidden />
                )}
                {k.label}
              </li>
            ))}
          </ul>
        )}
        {compact ? (
          <div className="tree__bar-row">
            <button
              type="button"
              className={`tree__key-btn${keyOpen ? ' is-on' : ''}`}
              aria-expanded={keyOpen}
              aria-controls="tree-key"
              onClick={() => setKeyOpen((o) => !o)}
            >
              Key
              <Icon name="chevron" size={14} className="tree__key-chev" />
            </button>
            {chips}
            {jumps}
          </div>
        ) : (
          <div className="tree__bar-row">
            {chips}
            {jumps}
          </div>
        )}
      </div>

      <div className="tree__scroll">
      <div
        ref={boardRef}
        className="tree__board"
        style={{ height: layout?.height ?? 640 }}
        onKeyDown={onKeyDown}
        onClick={(e) => {
          if (e.target === e.currentTarget && (live || credFilter !== null)) {
            setSelection(null)
            setCredFilter(null)
          }
        }}
      >
        {layout && <Wood layout={layout} focus={focus} grow={grow} bloom={bandShown('canopy')} />}
        {layout && (
          <>
            {layout.bands
              .filter((b) => b.kind === 'year')
              .map((b) => (
                <div
                  key={b.key}
                  className={`tree__band${b.current ? ' tree__band--now' : ''}${b.internship ? ' tree__band--internship' : ''}`}
                  style={{ top: b.y, height: b.h }}
                  data-band={b.key}
                  aria-hidden
                >
                  <span className="tree__year-label">
                    {b.label}
                    {b.current && <span className="tree__now"> · now</span>}
                    {/* Only when the year has courses: an empty one has its card, and a one-card band is too short for the longer label. */}
                    {b.internship && layout.nodes.some((n) => n.year === b.year) && <span className="tree__internship-tag"> · internship</span>}
                  </span>
                  {b.heads.map((h) => (
                    <span
                      key={h.lane}
                      className={`tree__lane-head tree__lane-head--${h.lane}`}
                      style={
                        h.lane === 'fall'
                          ? { top: h.y, right: layout.width - layout.trunkX + layout.trunkWidth / 2 + 14 }
                          : { top: h.y, left: layout.trunkX + layout.trunkWidth / 2 + 14 }
                      }
                    >
                      {h.label}
                    </span>
                  ))}
                </div>
              ))}
            {layout.degree && <DegreeReadout box={layout.degree} />}
            {layout.milestones.map((ms) => (
              <Milestone key={ms.id} milestone={ms} x={layout.trunkX} />
            ))}
            {/* The internship year, when the plan left it empty: a card on the trunk says why it's bare. */}
            {layout.bands
              .filter((b) => b.internship && !layout.nodes.some((n) => n.year === b.year))
              .map((b) => (
                <div key={`${b.key}-internship`} className="tree__internship" role="note" style={{ top: b.y + b.h / 2 + 10, left: layout.trunkX }}>
                  <strong>Internship year</strong>
                  <span>No courses this year</span>
                </div>
              ))}
            <div className="tree__band-sentinel" style={{ top: 0, height: layout.trunkTop }} data-band="canopy" aria-hidden />
            <div className="tree__band-sentinel" style={{ top: layout.trunkBase, height: layout.height - layout.trunkBase }} data-band="roots" aria-hidden />

            {focusLinks.length > 0 && (
              <svg className="tree__links" width={layout.width} height={layout.height} aria-hidden>
                <defs>
                  <filter id="tree-glow" filterUnits="userSpaceOnUse" x={0} y={0} width={layout.width} height={layout.height}>
                    <feGaussianBlur stdDeviation="3.5" result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                  {/* Every card is cut out of the links, so a line passes under a course, never across its text. */}
                  <mask id="tree-cards" maskUnits="userSpaceOnUse" x={0} y={0} width={layout.width} height={layout.height}>
                    <rect width={layout.width} height={layout.height} fill="white" />
                    {layout.nodes.map((n) => (
                      <rect key={n.code} x={n.x} y={n.y} width={n.w} height={n.h} rx={8} fill="black" />
                    ))}
                  </mask>
                </defs>
                <g mask="url(#tree-cards)">
                  {focusLinks.map((l) => (
                    <g
                      key={`${l.from}-${l.to}`}
                      className={`tree__link${l.conditional ? ' tree__link--or' : ''}`}
                      style={{ '--signal-delay': `${l.delay}ms`, '--len': l.length } as CSSProperties}
                    >
                      <path d={l.d} className="tree__link-line" pathLength={1} />
                      <path d={l.d} className="tree__signal" filter="url(#tree-glow)" />
                      <path d={l.d} className="tree__signal tree__signal--core" />
                      <path d={l.arrow} className="tree__arrow" />
                    </g>
                  ))}
                </g>
              </svg>
            )}

            {layout.nodes.map((n, i) => (
              <NodeCard
                key={n.code}
                node={n}
                layout={layout}
                title={m.courseTitle(n.code)}
                index={i}
                shown={bandShown(`year-${n.year}`)}
                on={focus ? focus.codes.has(n.code) : null}
                selected={live?.kind === 'node' && live.code === n.code}
                onSelect={() => {
                  setCredFilter(null)
                  select(live?.kind === 'node' && live.code === n.code ? null : { kind: 'node', code: n.code })
                }}
              />
            ))}


            {layout.leaves.map((leaf) => {
              const on = focus ? focus.creds.has(leaf.index) : null
              const pct = leaf.total > 0 ? leaf.done / leaf.total : 0
              return (
                <button
                  key={leaf.id}
                  type="button"
                  data-key={`leaf-${leaf.index}`}
                  className={`tree-leaf${leaf.index === 0 ? ' tree-leaf--hero' : ''}${on === false ? ' is-dim' : ''}${bandShown('canopy') ? ' is-in' : ''}`}
                  style={{ left: leaf.x, top: leaf.y, width: leaf.w, height: leaf.h, '--hue': hueVar(leaf.index), '--pct': pct } as CSSProperties}
                  aria-label={`${leaf.name}, ${KIND_LABEL[leaf.kind]}, ${leaf.done} of ${leaf.total} done${leaf.next ? `, next ${courseCode(leaf.next)}` : ''}`}
                  aria-pressed={live?.kind === 'leaf' && live.index === leaf.index}
                  onClick={() => {
                    setCredFilter(null)
                    select(live?.kind === 'leaf' && live.index === leaf.index ? null : { kind: 'leaf', index: leaf.index })
                  }}
                >
                  <span className="tree-leaf__ring" aria-hidden>
                    <svg viewBox="0 0 40 40">
                      <circle className="tree-leaf__track" cx="20" cy="20" r="17" pathLength={1} />
                      <circle className="tree-leaf__fill" cx="20" cy="20" r="17" pathLength={1} />
                    </svg>
                    <span className="tree-leaf__count">
                      {leaf.done}/{leaf.total}
                    </span>
                  </span>
                  <span className="tree-leaf__text">
                    <span className="tree-leaf__name">{shortName(leaf.name)}</span>
                    <span className="tree-leaf__kind">{KIND_LABEL[leaf.kind]}</span>
                  </span>
                </button>
              )
            })}

            <div className="tree__roots" style={{ top: layout.trunkBase + (layout.compact ? 88 : 104) }}>
              <p className="tree__plate">
                {m.selectedProgram?.name ?? 'Your degree'}
                {m.universityId === 'usask' && <span> · USask</span>}
              </p>
              {layout.nodes.every((n) => n.status !== 'completed') && (
                <p className="tree__sapling">A sapling for now. Add the courses you&rsquo;ve taken and it grows.</p>
              )}
            </div>
            <p className={`tree__cue${scrolledUp ? ' is-gone' : ''}`} style={{ top: layout.height - 40 }} aria-hidden>
              <svg viewBox="0 0 12 12" width="12" height="12">
                <path d="M6 10V2M2.5 5.5 6 2l3.5 3.5" />
              </svg>
              Scroll up to grow
            </p>
          </>
        )}
      </div>

      <div className="tree__float" aria-hidden={peek ? undefined : true}>
        {peek}
      </div>

      </div>

      {dock
        ? createPortal(
            detail ?? (
              <p className="card__empty tree-detail__empty">
                Pick a course to trace its path: arrows run from each prerequisite up to the course it unlocks. Pick a
                leaf to light up its whole branch.
              </p>
            ),
            dock,
          )
        : (
          <Sheet open={detail !== null && sheetOpen} onClose={() => setSheetOpen(false)} title={detailTitle}>
            {detail}
          </Sheet>
        )}
    </section>
  )
}

/**
 * A milestone on the trunk (admission to the major, the Honours application), on the line where the
 * tree's credit units reach it. A tap opens what it means.
 */
function Milestone({ milestone, x }: { milestone: TreeMilestone; x: number }) {
  const [open, setOpen] = useState(false)
  const id = `tree-ms-${milestone.id}`
  return (
    <div className={`tree-ms${milestone.reached ? ' tree-ms--reached' : ''}${open ? ' is-open' : ''}`} style={{ top: milestone.y, left: x }}>
      <button
        type="button"
        className="tree-ms__pin"
        aria-expanded={open}
        aria-describedby={id}
        onClick={() => {
          haptic.selection()
          setOpen((o) => !o)
        }}
      >
        <span className="tree-ms__dot" aria-hidden />
        {milestone.label}
        <span className="tree-ms__cu">{milestone.afterCu} cu</span>
      </button>
      <p id={id} className="tree-ms__detail" hidden={!open}>
        {milestone.detail}
        {milestone.reached ? ' Passed.' : ''}
      </p>
    </div>
  )
}

/** A course card. Status is carried by shape and fill as well as colour: solid, outlined, dashed, dimmed. */
function NodeCard({
  node,
  layout,
  title,
  index,
  shown,
  on,
  selected,
  onSelect,
}: {
  node: TreeNode
  layout: SkillTreeLayout
  title: string | undefined
  index: number
  shown: boolean
  on: boolean | null
  selected: boolean
  onSelect: () => void
}) {
  const status = node.status
  const classes = ['tree-node', `tree-node--${status}`]
  if (node.elective) classes.push('tree-node--elective')
  if (selected) classes.push('is-selected')
  if (on === false) classes.push('is-dim')
  if (on === true) classes.push('is-on')
  if (shown) classes.push('is-in')
  const creds = node.creds.map((c) => layout.leaves[c]?.name).filter(Boolean)
  const where = node.termKnown ? node.term : `${node.term}, placed by course level`
  const registered = status === 'inProgress' && !node.current
  const label = [
    courseCode(node.code),
    title,
    node.termKnown ? node.term : `Year ${node.year}, ${laneSeason(node.lane)} side, placed by course level`,
    registered ? 'registered' : status === 'inProgress' ? 'in progress' : status === 'next' ? 'best next course' : status,
    isElective(node.code) ? 'your choice of course' : node.elective ? `elective, ${node.elective.need} of ${node.elective.of} choices` : '',
    creds.length > 0 ? `counts toward ${creds.join(', ')}` : '',
    node.degreeGroup ? `fills ${node.degreeGroup}` : '',
  ]
    .filter(Boolean)
    .join(', ')
  const needs = status === 'locked' ? node.prereqs.find((p) => !layout.nodes.some((n) => n.code === p && (n.status === 'completed' || n.status === 'inProgress'))) : undefined
  const sub =
    status === 'locked'
      ? needs
        ? `Needs ${courseCode(needs)} first`
        : node.needsCredits
          ? `Needs ${node.needsCredits} first`
          : 'Needs its prerequisites first'
      : registered
        ? `Registered · ${node.term.replace(' ', '\u00a0')}`
        : isElective(node.code)
          ? 'Your choice'
          : node.elective
            ? `Elective · ${node.elective.need} of ${node.elective.of}`
            : title
  const filled = status === 'completed' || status === 'next'
  return (
    <button
      type="button"
      data-key={node.code}
      className={classes.join(' ')}
      style={
        {
          left: node.x,
          top: node.y,
          width: node.w,
          height: node.h,
          '--i': index % 12,
        } as CSSProperties
      }
      title={`${courseCode(node.code)}${title ? ` · ${title}` : ''} · ${where}`}
      aria-label={label}
      aria-pressed={selected}
      onClick={onSelect}
    >
      <span className="tree-node__head">
        {/* An unnamed slot's name is its label ("Breadth: Humanities or Social Science"): it wraps. */}
        {isElective(node.code) ? (
          <span className="tree-node__code tree-node__code--slot">{electiveLabel(node.code)}</span>
        ) : (
          <span className="tree-node__code">{courseCode(node.code)}</span>
        )}
        {status === 'next' && <span className="tree-node__tag">Next</span>}
        {status === 'inProgress' && node.current && <span className="tree-node__tag tree-node__tag--now">Now</span>}
        {status === 'completed' && (
          <svg className="tree-node__glyph" viewBox="0 0 12 12" aria-hidden>
            <path d="M2.5 6.3 5 8.7l4.6-5" />
          </svg>
        )}
        {status === 'locked' && (
          <svg className="tree-node__glyph" viewBox="0 0 12 12" aria-hidden>
            <rect x="2.6" y="5.4" width="6.8" height="4.8" rx="1.2" />
            <path d="M4 5.4V4a2 2 0 0 1 4 0v1.4" />
          </svg>
        )}
      </span>
      {sub && <span className={`tree-node__sub${status === 'locked' || node.elective ? ' tree-node__sub--one' : ''}`}>{sub}</span>}
      {!filled && node.creds.length > 0 && (
        <span className="tree-node__dots" aria-hidden>
          {node.creds.map((c) => (
            <span key={c} style={{ '--hue': hueVar(c) } as CSSProperties} />
          ))}
        </span>
      )}
    </button>
  )
}

/** The wood, behind the cards: roots, a tapered trunk that grows up, a twig per course, the crown's branches. */
function Wood({
  layout,
  focus,
  grow,
  bloom,
}: {
  layout: SkillTreeLayout
  focus: { codes: Set<string>; creds: Set<number> } | null
  grow: boolean
  bloom: boolean
}) {
  const statusOf = new Map(layout.nodes.map((n) => [n.code, n.status]))
  return (
    <svg className="tree__svg" width={layout.width} height={layout.height} viewBox={`0 0 ${layout.width} ${layout.height}`} aria-hidden>
      <defs>
        {/* The trunk grows by drawing this line up through a mask, so its taper survives the animation. */}
        <mask id="tree-grow" maskUnits="userSpaceOnUse" x="0" y="0" width={layout.width} height={layout.height}>
          <path d={layout.trunkLine} className={`tree__grow-line${grow ? ' is-drawing' : ''}`} pathLength={1} />
        </mask>
      </defs>

      {layout.bands
        .filter((b) => b.kind === 'year')
        .map((b) => (
          <line key={b.key} x1={layout.compact ? 12 : 20} x2={layout.width - 10} y1={b.y} y2={b.y} className="tree__hairline" />
        ))}

      <g className={`tree__roots-wood${grow ? ' is-growing' : ''}`}>
        {layout.roots.map((r, i) => (
          <path key={i} d={r.d} className="tree__root" style={{ strokeWidth: r.w }} />
        ))}
      </g>

      <path d={layout.trunk} className="tree__trunk" mask="url(#tree-grow)" />

      {layout.twigs.map((t) => {
        const on = focus ? focus.codes.has(t.code) : null
        const done = statusOf.get(t.code) === 'completed'
        return <path key={t.code} d={t.d} className={`tree__twig${done ? ' tree__twig--done' : ''}${on === true ? ' is-on' : on === false ? ' is-dim' : ''}`} />
      })}

      {layout.branches.map((b) => {
        const on = focus ? focus.creds.has(b.leaf) : null
        return (
          <path
            key={b.leaf}
            d={b.d}
            pathLength={1}
            className={`tree__branch${grow && !bloom ? ' is-folded' : ''}${on === true ? ' is-on' : on === false ? ' is-dim' : ''}`}
            style={{ '--hue': hueVar(b.leaf) } as CSSProperties}
          />
        )
      })}
    </svg>
  )
}
