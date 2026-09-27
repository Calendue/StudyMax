import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { useReducedMotion } from 'motion/react'
import { useModel } from '../model.ts'
import { courseCode, KIND_LABEL } from '../format.ts'
import { haptic } from '../platform.ts'
import { layoutSkillTree, pathThrough, type SkillTreeLayout, type TreeNode, type TreeTrace } from '../lib/skillTree.ts'
import { Sheet } from '../ui/Sheet.tsx'
import { useTreeInputs, type TreeSelection } from './planView.ts'
import { TreeDetail } from './TreeDetail.tsx'
import './skilltree.css'

// The first time the tree opens in a session it grows; after that it's simply there.
let grownThisSession = false

const LEGEND: { key: string; label: string }[] = [
  { key: 'completed', label: 'Done' },
  { key: 'inProgress', label: 'Now' },
  { key: 'next', label: 'Next' },
  { key: 'planned', label: 'Planned' },
  { key: 'elective', label: 'Elective' },
  { key: 'locked', label: 'Locked' },
]

/** The page's scrolling element: the phone's screen body, or the desktop shell's page. */
function scrollerOf(el: HTMLElement): HTMLElement {
  return (el.closest('.screen__body, .shell__page') as HTMLElement | null) ?? document.scrollingElement as HTMLElement
}

function hueVar(cred: number | undefined): string {
  return cred === undefined ? 'var(--tree-silk-3)' : `var(--tree-cred-${cred + 1})`
}

/**
 * The Academic Skill Tree: the degree as a circuit board that grows up from the roots, Fall on the
 * left of the trunk and Winter on the right, into a canopy of the credentials being worked toward.
 * It opens at the roots and you scroll UP to grow. Layout lives in src/lib/skillTree.ts; this draws
 * it and owns the interaction.
 *
 * `dock`, when given, is where the details of the selected course go (the desktop's side panel);
 * otherwise they open in a bottom sheet.
 */
export function SkillTree({ dock, bleed = false, stickyTop = 0 }: { dock?: HTMLElement | null; bleed?: boolean; stickyTop?: number }) {
  const m = useModel()
  const reduce = useReducedMotion() ?? false
  const inputs = useTreeInputs()

  const sectionRef = useRef<HTMLElement>(null)
  const boardRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
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
            completed: m.completed,
            inProgress: m.inProgressCourses,
            plan: m.plan,
            currentTerm: inputs.currentTerm,
            targets: inputs.targets,
            bestNext: inputs.bestNext,
            width,
          })
        : null,
    [m.completed, m.inProgressCourses, m.plan, inputs, width],
  )

  const [selection, setSelection] = useState<TreeSelection | null>(null)
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
    let frame = 0
    const onScroll = () => {
      fromBottom.current = Math.max(0, boardBottomIn(scroller) - scroller.clientHeight + 8 - scroller.scrollTop)
      if (Math.abs(scroller.scrollTop - start) > 24) setScrolledUp(true)
      setAwayFromRoots(fromBottom.current > 260)
      if (reduce || frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        // The PCB grid drifts a little slower than the board: transform only.
        if (gridRef.current) gridRef.current.style.transform = `translate3d(0, ${(fromBottom.current * -0.06).toFixed(1)}px, 0)`
      })
    }
    scroller.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      scroller.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(frame)
    }
  }, [reduce, ready])

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
    if (next && scroll && layout) {
      const target = next.kind === 'node' ? layout.nodes.find((n) => n.code === next.code) : layout.leaves[next.index]
      if (target) scrollToY(target.y + target.h / 2)
      window.setTimeout(() => {
        const key = next.kind === 'node' ? next.code : `leaf-${next.index}`
        boardRef.current?.querySelector<HTMLElement>(`[data-key="${key}"]`)?.focus({ preventScroll: true })
      }, reduce ? 0 : 320)
    }
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

  const detail = layout && live ? <TreeDetail layout={layout} selection={live} onSelect={(s) => select(s, true)} /> : null
  const detailTitle =
    live?.kind === 'node' ? courseCode(live.code) : live?.kind === 'leaf' && layout ? layout.leaves[live.index]?.name ?? '' : ''

  const classes = ['tree']
  if (bleed) classes.push('tree--bleed')
  if (grow) classes.push('tree--grow')
  if (focus) classes.push('tree--focus')
  if (layout?.compact) classes.push('tree--compact')

  return (
    <section
      ref={sectionRef}
      className={classes.join(' ')}
      aria-label="Academic skill tree"
      style={{ '--tree-sticky-top': `${stickyTop}px` } as CSSProperties}
    >
      <div className="tree__bar">
        <ul className="tree__legend" aria-label="Key">
          {LEGEND.map((k) => (
            <li key={k.key}>
              <span className={`tree__key tree__key--${k.key}`} aria-hidden />
              {k.label}
            </li>
          ))}
        </ul>
        {layout && layout.leaves.length > 0 && (
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
                <span className="tree__chip-name">{leaf.name}</span>
                <span className="tree__chip-count">
                  {leaf.done}/{leaf.total}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

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
        <div ref={gridRef} className="tree__grid" aria-hidden />
        {layout && <Board layout={layout} focus={focus} grow={grow} />}
        {layout && (
          <>
            {layout.bands
              .filter((b) => b.kind === 'year')
              .map((b) => (
                <div key={b.key} className="tree__year" style={{ top: b.y, height: b.h }} data-band={b.key} aria-hidden>
                  <span className={`tree__year-label${b.current ? ' tree__year-label--now' : ''}`}>{b.label}</span>
                </div>
              ))}
            <div className="tree__band-sentinel" style={{ top: 0, height: layout.trunkTop }} data-band="canopy" aria-hidden />
            <div className="tree__band-sentinel" style={{ top: layout.trunkBase, height: layout.height - layout.trunkBase }} data-band="roots" aria-hidden />

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
                      <circle className="tree-leaf__track" cx="20" cy="20" r="16" pathLength={1} />
                      <circle className="tree-leaf__fill" cx="20" cy="20" r="16" pathLength={1} />
                    </svg>
                    <span className="tree-leaf__count">
                      {leaf.done}/{leaf.total}
                    </span>
                  </span>
                  <span className="tree-leaf__text">
                    <span className="tree-leaf__name">{leaf.name}</span>
                    <span className="tree-leaf__kind">
                      {KIND_LABEL[leaf.kind]}
                    </span>
                  </span>
                </button>
              )
            })}

            <div className="tree__roots" style={{ top: layout.trunkBase + (layout.compact ? 102 : 118) }}>
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

      <div className="tree__float" aria-hidden={!awayFromRoots}>
        <div className={`tree__float-inner${awayFromRoots ? ' is-on' : ''}`}>
          <button type="button" className="tree__float-btn" tabIndex={awayFromRoots ? 0 : -1} onClick={toRoots}>
            <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden>
              <path d="M6 2v8M2.5 6.5 6 10l3.5-3.5" />
            </svg>
            Back to roots
          </button>
          {layout && (
            <button
              type="button"
              className="tree__float-btn"
              tabIndex={awayFromRoots ? 0 : -1}
              onClick={() => {
                const band = layout.bands.find((b) => b.current)
                if (band) scrollToY(band.y + band.h / 2)
              }}
            >
              Jump to now
            </button>
          )}
        </div>
      </div>

      {dock
        ? createPortal(
            detail ?? (
              <p className="card__empty tree-detail__empty">
                Pick a course on the tree to see its prerequisites, what it unlocks and what it counts toward. Pick a leaf
                to light up its whole branch.
              </p>
            ),
            dock,
          )
        : (
          <Sheet open={detail !== null} onClose={() => setSelection(null)} title={detailTitle}>
            {detail}
          </Sheet>
        )}
    </section>
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
  const label = [
    courseCode(node.code),
    title,
    `${node.lane === 'fall' ? 'Fall' : 'Winter'} ${node.termKnown ? node.term : `Year ${node.year}`}`,
    status === 'inProgress' ? 'in progress' : status === 'next' ? 'best next course' : status,
    node.elective ? `elective, ${node.elective.need} of ${node.elective.of} choices` : '',
    creds.length > 0 ? `counts toward ${creds.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join(', ')
  const compactElective = layout.compact && node.elective
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
          '--hue': hueVar(node.creds[0]),
          '--i': index % 12,
        } as CSSProperties
      }
      title={`${courseCode(node.code)}${title ? ` · ${title}` : ''} · ${where}`}
      aria-label={label}
      aria-pressed={selected}
      onClick={onSelect}
    >
      <span className="tree-node__code">{compactElective ? 'Elective' : courseCode(node.code)}</span>
      {compactElective ? (
        <span className="tree-node__sub">
          {node.elective!.need} of {node.elective!.of}
        </span>
      ) : node.elective ? (
        <span className="tree-node__sub">
          Elective · {node.elective.need} of {node.elective.of}
        </span>
      ) : (
        !layout.compact && title && <span className="tree-node__sub">{title}</span>
      )}
      {status === 'completed' && (
        <svg className="tree-node__glyph" viewBox="0 0 10 10" aria-hidden>
          <path d="M2 5.2 4.1 7.3 8 3" />
        </svg>
      )}
      {status === 'locked' && (
        <svg className="tree-node__glyph" viewBox="0 0 10 10" aria-hidden>
          <rect x="2.2" y="4.6" width="5.6" height="4" rx="0.8" />
          <path d="M3.4 4.6V3.4a1.6 1.6 0 0 1 3.2 0v1.2" />
        </svg>
      )}
    </button>
  )
}

/** The copper: bands, trunk, rails, taps, prerequisite traces, vias and roots, in one SVG. */
function Board({
  layout,
  focus,
  grow,
}: {
  layout: SkillTreeLayout
  focus: { codes: Set<string>; creds: Set<number> } | null
  grow: boolean
}) {
  const traceOn = (t: TreeTrace): boolean | null => {
    if (!focus) return null
    if (t.kind === 'prereq') return focus.codes.has(t.from!) && focus.codes.has(t.to!)
    if (t.kind === 'tap') return focus.codes.has(t.from!) && (t.cred === undefined || focus.creds.has(t.cred))
    if (t.kind === 'rail') return focus.creds.has(t.cred!)
    return null
  }
  const { trunkX, trunkWidth, trunkBase, trunkTop, compact } = layout
  const byKind = (kind: TreeTrace['kind']) => layout.traces.filter((t) => t.kind === kind)
  const laneLabelX = { fall: trunkX - trunkWidth / 2 - 10, winter: trunkX + trunkWidth / 2 + 10 }
  const pinStart = (d: string) => {
    const [, x, y] = d.split(' ')
    return { x: Number(x), y: Number(y) }
  }

  const trace = (t: TreeTrace) => {
    const on = traceOn(t)
    const cls = ['tr', `tr--${t.kind}`, `tr--${t.state}`]
    if (t.conditional) cls.push('tr--or')
    if (on === true) cls.push('is-on')
    if (on === false) cls.push('is-dim')
    const style = { '--hue': t.kind === 'tap' || t.kind === 'rail' ? hueVar(t.cred) : undefined } as CSSProperties
    const pad = t.kind === 'prereq' ? pinStart(t.d) : null
    return (
      <g key={t.id} className={cls.join(' ')} style={style}>
        <path className="tr__jacket" d={t.d} />
        {t.state === 'lit' && <path className="tr__halo" d={t.d} />}
        <path className="tr__core" d={t.d} markerEnd={t.kind === 'prereq' ? `url(#tree-arrow-${t.state})` : undefined} />
        {t.conditional && !compact && <path className="tr__stripe" d={t.d} />}
        {t.state === 'lit' && (t.kind === 'prereq' || t.kind === 'rail') && <path className="tr__pulse" d={t.d} pathLength={1} />}
        {pad && <circle className="tr__pad" cx={pad.x} cy={pad.y} r={2.2} />}
      </g>
    )
  }

  return (
    <svg className="tree__svg" width={layout.width} height={layout.height} viewBox={`0 0 ${layout.width} ${layout.height}`} aria-hidden>
      <defs>
        {(['lit', 'live', 'idle', 'locked'] as const).map((s) => (
          <marker key={s} id={`tree-arrow-${s}`} viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="4.5" markerHeight="4.5" orient="auto-start-reverse" markerUnits="strokeWidth">
            <path d="M 0.5 1 L 9.2 5 L 0.5 9 Z" className={`tree__arrow tree__arrow--${s}`} />
          </marker>
        ))}
      </defs>

      {/* The dashed year lines, under everything. */}
      {layout.bands
        .filter((b) => b.kind === 'year')
        .map((b) => (
          <line
            key={b.key}
            x1={compact ? 22 : 34}
            x2={layout.width - 6}
            y1={b.y}
            y2={b.y}
            className={`tree__band-line${b.current ? ' tree__band-line--now' : ''}`}
          />
        ))}
      <line x1={compact ? 22 : 34} x2={layout.width - 6} y1={trunkBase} y2={trunkBase} className="tree__band-line tree__band-line--ground" />

      {/* The trunk: a machined jacket the rails run inside. */}
      <path className={`tree__trunk${grow ? ' is-drawing' : ''}`} d={`M ${trunkX} ${trunkBase} L ${trunkX} ${trunkTop}`} pathLength={1} style={{ strokeWidth: trunkWidth }} />
      <path className="tree__trunk-edge" d={`M ${trunkX - trunkWidth / 2} ${trunkBase} L ${trunkX - trunkWidth / 2} ${trunkTop}`} />

      <g className={`tree__layer${grow ? ' is-drawing' : ''}`}>
        {byKind('root').map(trace)}
        {layout.traces
          .filter((t) => t.kind === 'root')
          .map((t) => {
            const parts = t.d.split(' ')
            const x = Number(parts[parts.length - 2])
            const y = Number(parts[parts.length - 1])
            return <rect key={`pad-${t.id}`} className="tree__root-pad" x={x - 4} y={y} width={8} height={12} rx={2} />
          })}
        {byKind('rail').map(trace)}
        {byKind('tap').map(trace)}
        {byKind('prereq').map(trace)}
        {/* Silkscreen over the copper, with a keep-out around the letters: the lanes, and where "now" is. */}
        {layout.bands
          .filter((b) => b.kind === 'year')
          .map((b) => (
            <g key={b.key}>
              <text x={laneLabelX.fall} y={b.y + (compact ? 15 : 18)} textAnchor="end" className="tree__silk">
                FALL
              </text>
              <text x={laneLabelX.winter} y={b.y + (compact ? 15 : 18)} className="tree__silk">
                WINTER
              </text>
              {b.current && (
                <text x={layout.width - 10} y={b.y + (compact ? 15 : 18)} textAnchor="end" className="tree__silk tree__silk--now">
                  NOW
                </text>
              )}
            </g>
          ))}
        {layout.vias.map((v) => {
          const on = focus ? focus.codes.has(v.code) && focus.creds.has(v.cred) : null
          return (
            <circle
              key={`via-${v.code}-${v.cred}`}
              cx={v.x}
              cy={v.y}
              r={compact ? 2.4 : 2.8}
              className={`tree__via${v.lit ? ' tree__via--lit' : ''}${on === false ? ' is-dim' : ''}`}
              style={{ '--hue': hueVar(v.cred) } as CSSProperties}
            />
          )
        })}
      </g>
    </svg>
  )
}
