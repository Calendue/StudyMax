import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { computerScience } from '../../data/programs/computerScience.ts'
import { courseCode } from '../../format.ts'
import { courseTitle, prerequisitesOf } from './facts.ts'
import '../../skilltree/skilltree.css'

// The wow beat: a small, live Academic Skill Tree in the app's own cards. Nine real USask courses,
// with the arrows the catalogue's own prerequisites draw between them, a chain pulsing up into the
// one course to take next, and the credential it counts toward filling in at the top. Hover or tap
// a course and, as in the app, only its own arrows show: what it needs, and what it unlocks.

type Status = 'completed' | 'next' | 'locked'

// Bottom row first. Fall on the left of the trunk, Winter on the right, as in the app.
const COURSES: { code: string; row: number; lane: -1 | 1; status: Status }[] = [
  { code: 'MATH110', row: 0, lane: -1, status: 'completed' },
  { code: 'CMPT141', row: 0, lane: 1, status: 'completed' },
  { code: 'CMPT145', row: 1, lane: -1, status: 'completed' },
  { code: 'STAT245', row: 1, lane: 1, status: 'completed' },
  { code: 'CMPT270', row: 2, lane: -1, status: 'completed' },
  { code: 'CMPT260', row: 2, lane: 1, status: 'completed' },
  { code: 'CMPT280', row: 3, lane: -1, status: 'completed' },
  { code: 'CMPT317', row: 4, lane: 1, status: 'next' },
  { code: 'CMPT423', row: 5, lane: -1, status: 'locked' },
]
const ROWS = 6
const NEXT = 'CMPT317'
const LEAF = 'leaf'
/** The chain that pulses by default: the roots up to the course to take next, then into the credential. */
const CHAIN = ['CMPT141', 'CMPT145', 'CMPT270', 'CMPT280', NEXT, LEAF]

const SPEC = computerScience.specializations.find((s) => s.id === 'artificial-intelligence')!
const DONE = new Set(COURSES.filter((c) => c.status === 'completed').map((c) => c.code))
const met = (done: Set<string>) => SPEC.requirements.filter((r) => r.courses.filter((c) => done.has(c)).length >= r.need).length
const DONE_COUNT = met(DONE)
const WITH_NEXT = met(new Set([...DONE, NEXT]))
const TOTAL = SPEC.requirements.length

interface Placed {
  code: string
  status: Status
  x: number
  y: number
  w: number
  h: number
}

interface MiniLink {
  from: string
  to: string
  d: string
  arrow: string
  len: number
}

function layout(width: number) {
  const compact = width < 460
  const trunkX = width / 2
  const inner = compact ? 14 : 26
  const w = Math.min(compact ? 150 : 214, width / 2 - inner - 2)
  const h = compact ? 54 : 62
  const pitch = h + (compact ? 26 : 38)
  const leaf = { w: Math.min(compact ? 250 : 280, width - 24), h: compact ? 60 : 66 }
  const top = 6
  const crownGap = compact ? 44 : 54
  const rootsH = compact ? 36 : 46
  const height = top + leaf.h + crownGap + ROWS * pitch + rootsH
  const nodes: Placed[] = COURSES.map((c) => ({
    code: c.code,
    status: c.status,
    x: Math.round(c.lane < 0 ? trunkX - inner - w : trunkX + inner),
    y: top + leaf.h + crownGap + (ROWS - 1 - c.row) * pitch + (pitch - h),
    w: Math.round(w),
    h,
  }))
  const leafBox = { x: Math.round(trunkX - leaf.w / 2), y: top, w: Math.round(leaf.w), h: leaf.h }
  const byCode = new Map(nodes.map((n) => [n.code, n]))
  const shown = new Set(nodes.map((n) => n.code))

  // Links straight from the catalogue: a course's prerequisites that are on the tree, up into it.
  const pairs: { from: string; to: string }[] = []
  for (const n of nodes) for (const p of prerequisitesOf(n.code)) if (shown.has(p) && p !== n.code) pairs.push({ from: p, to: n.code })
  pairs.push({ from: NEXT, to: LEAF })
  const spread = (list: string[], key: string, box: { x: number; w: number }) => {
    const i = list.indexOf(key)
    const step = Math.min(26, (box.w - 40) / Math.max(1, list.length - 1))
    return box.x + box.w / 2 + (i - (list.length - 1) / 2) * step
  }
  const links: MiniLink[] = pairs.map(({ from, to }) => {
    const a = byCode.get(from)!
    const b = to === LEAF ? leafBox : byCode.get(to)!
    const outs = pairs.filter((p) => p.from === from).sort((p, q) => boxX(p.to) - boxX(q.to)).map((p) => p.to)
    const ins = pairs.filter((p) => p.to === to).sort((p, q) => boxX(p.from) - boxX(q.from)).map((p) => p.from)
    const ax = spread(outs, to, a)
    const bx = spread(ins, from, b)
    const ay = a.y - 1
    const by = b.y + b.h + 9
    const k = Math.max(18, (ay - by) * 0.5)
    const len = Math.round(Math.hypot(bx - ax, ay - by) * 1.12)
    return {
      from,
      to,
      d: `M ${ax} ${ay} C ${ax} ${ay - k}, ${bx} ${by + k}, ${bx} ${by}`,
      arrow: `M ${bx - 5} ${b.y + b.h + 10} L ${bx} ${b.y + b.h + 1} L ${bx + 5} ${b.y + b.h + 10} Z`,
      len,
    }
  })
  function boxX(code: string) {
    const n = code === LEAF ? leafBox : byCode.get(code)!
    return n.x + n.w / 2
  }

  // The wood: a slim tapered trunk, a twig to each card, a branch into the leaf, a few roots.
  const base = height - rootsH + 8
  const crown = leafBox.y + leafBox.h
  const tw = (y: number) => 3 + ((compact ? 9 : 12) - 3) * ((y - crown) / (base - crown))
  const trunk = `M ${trunkX - tw(base) / 2} ${base} C ${trunkX - tw(base) / 2} ${(base + crown) / 2}, ${trunkX - 1.5} ${crown + 40}, ${trunkX - 1.5} ${crown} L ${trunkX + 1.5} ${crown} C ${trunkX + 1.5} ${crown + 40}, ${trunkX + tw(base) / 2} ${(base + crown) / 2}, ${trunkX + tw(base) / 2} ${base} Z`
  const twigs = nodes.map((n) => {
    const cy = n.y + n.h / 2
    const edge = n.x < trunkX ? n.x + n.w : n.x
    const dir = n.x < trunkX ? -1 : 1
    return { code: n.code, d: `M ${trunkX} ${cy + 12} C ${trunkX + dir * inner * 0.6} ${cy + 12}, ${edge - dir * inner * 0.5} ${cy}, ${edge} ${cy}` }
  })
  const roots = [-1, -0.45, 0.1, 0.6, 1].map(
    (k) => `M ${trunkX + k * 3} ${base} C ${trunkX + k * 10} ${base + 16}, ${trunkX + k * (compact ? 60 : 110)} ${base + 18}, ${trunkX + k * (compact ? 90 : 170)} ${base + rootsH - 12 - Math.abs(k) * 8}`,
  )
  return { compact, width, height, nodes, leafBox, links, trunk, twigs, roots, trunkX }
}

/** The line beside the tree: what the course to take next does for the credential. */
export function ShowcaseNext() {
  return (
    <p className="showcase__next">
      <span className="showcase__next-tag">Next</span> {courseCode(NEXT)} makes it {WITH_NEXT} of {TOTAL} for {SPEC.name}.
    </p>
  )
}

export function Showcase({ grown, live }: { grown: boolean; live: boolean }) {
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
  const tree = useMemo(() => (width > 0 ? layout(width) : null), [width])

  // Hover or focus shows a course's own arrows; a tap pins it (tap again, or elsewhere, to let go).
  const [hover, setHover] = useState<string | null>(null)
  const [pinned, setPinned] = useState<string | null>(null)
  const active = hover ?? pinned

  const shownLinks = useMemo(() => {
    if (!tree) return []
    if (!active) {
      return tree.links
        .filter((l) => CHAIN.indexOf(l.to) === CHAIN.indexOf(l.from) + 1 && CHAIN.includes(l.from))
        .map((l) => ({ ...l, delay: CHAIN.indexOf(l.from) * 420 }))
    }
    return tree.links.filter((l) => l.to === active || l.from === active).map((l) => ({ ...l, delay: l.to === active ? 0 : 900 }))
  }, [tree, active])
  const lit = useMemo(() => {
    if (!active) return null
    return new Set([active, ...shownLinks.flatMap((l) => [l.from, l.to])])
  }, [active, shownLinks])

  const classes = ['tree', 'mini', 'tree--grow']
  if (lit) classes.push('tree--focus')
  if (tree?.compact) classes.push('tree--compact')
  if (live) classes.push('is-live')
  const pct = grown ? DONE_COUNT / TOTAL : 0
  const nextPct = WITH_NEXT / TOTAL

  return (
    <div className={classes.join(' ')} onPointerLeave={() => setHover(null)}>
      <div
        ref={boardRef}
        className="mini__board"
        style={{ height: tree?.height ?? 560 }}
        onClick={(e) => {
          if (e.target === e.currentTarget) setPinned(null)
        }}
      >
        {tree && (
          <>
            <svg className="mini__wood" width={tree.width} height={tree.height} aria-hidden>
              {tree.roots.map((d, i) => (
                <path key={i} d={d} className="tree__root" style={{ strokeWidth: 2.4 - Math.abs(i - 2) * 0.5 }} />
              ))}
              <path d={tree.trunk} className="tree__trunk" />
              {tree.twigs.map((t) => (
                <path
                  key={t.code}
                  d={t.d}
                  className={`tree__twig${DONE.has(t.code) ? ' tree__twig--done' : ''}${lit ? (lit.has(t.code) ? ' is-on' : ' is-dim') : ''}`}
                />
              ))}
            </svg>

            <svg className="mini__links" width={tree.width} height={tree.height} aria-hidden>
              <defs>
                <filter id="mini-glow" filterUnits="userSpaceOnUse" x={0} y={0} width={tree.width} height={tree.height}>
                  <feGaussianBlur stdDeviation="3.5" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <mask id="mini-cards" maskUnits="userSpaceOnUse" x={0} y={0} width={tree.width} height={tree.height}>
                  <rect width={tree.width} height={tree.height} fill="white" />
                  {[...tree.nodes, tree.leafBox].map((n, i) => (
                    <rect key={i} x={n.x} y={n.y} width={n.w} height={n.h} rx={10} fill="black" />
                  ))}
                </mask>
              </defs>
              {grown && (
                <g mask="url(#mini-cards)">
                  {shownLinks.map((l) => (
                    <g
                      key={`${active ?? 'chain'}-${l.from}-${l.to}`}
                      className="tree__link mini__link"
                      style={{ '--signal-delay': `${l.delay}ms`, '--len': l.len } as CSSProperties}
                    >
                      <path d={l.d} className="tree__link-line" pathLength={1} />
                      {live && <path d={l.d} className="tree__signal" filter="url(#mini-glow)" />}
                      {live && <path d={l.d} className="tree__signal tree__signal--core" />}
                      <path d={l.arrow} className="tree__arrow" />
                    </g>
                  ))}
                </g>
              )}
            </svg>

            {tree.nodes.map((n, i) => {
              const on = lit ? lit.has(n.code) : null
              const title = courseTitle(n.code)
              const needs = n.status === 'locked' ? courseCode(NEXT) : null
              return (
                <button
                  key={n.code}
                  type="button"
                  className={`tree-node tree-node--${n.status}${grown ? ' is-in' : ''}${active === n.code ? ' is-selected' : ''}${on === false ? ' is-dim' : ''}`}
                  style={{ left: n.x, top: n.y, width: n.w, height: n.h, '--i': COURSES.length - i } as CSSProperties}
                  aria-label={`${courseCode(n.code)}, ${title}, ${n.status === 'completed' ? 'done' : n.status === 'next' ? 'take next' : `needs ${needs} first`}`}
                  aria-pressed={pinned === n.code}
                  onPointerEnter={(e) => {
                    if (e.pointerType === 'mouse') setHover(n.code)
                  }}
                  onFocus={() => setHover(n.code)}
                  onBlur={() => setHover(null)}
                  onClick={() => setPinned((p) => (p === n.code ? null : n.code))}
                >
                  <span className="tree-node__head">
                    <span className="tree-node__code">{courseCode(n.code)}</span>
                    {n.status === 'next' && <span className="tree-node__tag">Next</span>}
                    {n.status === 'completed' && (
                      <svg className="tree-node__glyph" viewBox="0 0 12 12" aria-hidden>
                        <path d="M2.5 6.3 5 8.7l4.6-5" />
                      </svg>
                    )}
                    {n.status === 'locked' && (
                      <svg className="tree-node__glyph" viewBox="0 0 12 12" aria-hidden>
                        <rect x="2.6" y="5.4" width="6.8" height="4.8" rx="1.2" />
                        <path d="M4 5.4V4a2 2 0 0 1 4 0v1.4" />
                      </svg>
                    )}
                  </span>
                  <span className={`tree-node__sub${needs ? ' tree-node__sub--one' : ''}`}>{needs ? `Needs ${needs} first` : title}</span>
                </button>
              )
            })}

            <div
              className={`tree-leaf tree-leaf--hero mini__leaf${grown ? ' is-in' : ''}${lit && !lit.has(LEAF) ? ' is-dim' : ''}`}
              style={{ left: tree.leafBox.x, top: tree.leafBox.y, width: tree.leafBox.w, height: tree.leafBox.h, '--hue': 'var(--tree-cred-1)', '--pct': pct, '--next': nextPct } as CSSProperties}
              role="img"
              aria-label={`${SPEC.name} specialization: ${DONE_COUNT} of ${TOTAL} requirements done, ${courseCode(NEXT)} makes it ${WITH_NEXT}`}
            >
              <span className="tree-leaf__ring" aria-hidden>
                <svg viewBox="0 0 40 40">
                  <circle className="tree-leaf__track" cx="20" cy="20" r="17" pathLength={1} />
                  <circle className="mini__leaf-next" cx="20" cy="20" r="17" pathLength={1} />
                  <circle className="tree-leaf__fill" cx="20" cy="20" r="17" pathLength={1} />
                </svg>
                <span className="tree-leaf__count">
                  {DONE_COUNT}/{TOTAL}
                </span>
              </span>
              <span className="tree-leaf__text">
                <span className="tree-leaf__name">{SPEC.name}</span>
                <span className="tree-leaf__kind">Specialization</span>
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
