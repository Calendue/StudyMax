import type { CSSProperties } from 'react'
import type { ClimbGeometry } from './geometry.ts'

// The landing page's tree, drawn from the geometry the climb measured: the colour zones behind it,
// the wood (roots, a trunk that grows as you climb, a branch per card, the crown), and the arrows
// that carry the glowing signal up from each beat to the next.

/** The zones: dark soil at the roots, the page through the trunk, a dusk sky at the canopy. They meet in waves. */
export function Zones({ g }: { g: ClimbGeometry }) {
  const bleed = g.compact ? 40 : 160
  return (
    <svg className="climb__zones" style={{ left: -bleed }} width={g.width + bleed * 2} height={g.height} viewBox={`${-bleed} 0 ${g.width + bleed * 2} ${g.height}`} aria-hidden>
      <defs>
        <linearGradient id="climb-sky" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2={g.dusk + 30}>
          <stop offset="0" style={{ stopColor: 'var(--climb-dusk-top)' }} />
          <stop offset="0.55" style={{ stopColor: 'var(--climb-dusk-mid)' }} />
          <stop offset="1" style={{ stopColor: 'var(--climb-dusk-low)' }} />
        </linearGradient>
        <linearGradient id="climb-soil" gradientUnits="userSpaceOnUse" x1="0" y1={g.base.y - 30} x2="0" y2={g.height}>
          <stop offset="0" style={{ stopColor: 'var(--climb-soil-top)' }} />
          <stop offset="1" style={{ stopColor: 'var(--climb-soil)' }} />
        </linearGradient>
      </defs>
      {g.band && <path d={g.band} className="climb__band" />}
      <path d={g.sky} fill="url(#climb-sky)" />
      <path d={g.skyLine} className="climb__horizon" />
      <path d={g.soil} fill="url(#climb-soil)" />
      <path d={g.groundLine} className="climb__rim" />
    </svg>
  )
}

/** The wood: it grows as the climb reaches each beat, and each branch reaches out once its beat has grown. */
export function Wood({ g, grown, reduce }: { g: ClimbGeometry; grown: number; reduce: boolean }) {
  const reached = grown < 0 ? 0 : (g.grownAt[Math.min(grown, g.grownAt.length - 1)] ?? 1)
  return (
    <svg className="climb__wood" width={g.width} height={g.height} viewBox={`0 0 ${g.width} ${g.height}`} aria-hidden>
      <defs>
        <mask id="climb-grow" maskUnits="userSpaceOnUse" x={-200} y={0} width={g.width + 400} height={g.height}>
          <path
            d={g.trunkLine}
            className="climb__grow-line"
            pathLength={1}
            style={{ strokeWidth: g.compact ? 60 : 200, strokeDashoffset: reduce ? 0 : 1 - reached }}
          />
        </mask>
        <filter id="climb-root-glow" filterUnits="userSpaceOnUse" x={-200} y={g.base.y - 60} width={g.width + 400} height={g.height - g.base.y + 60}>
          <feGaussianBlur stdDeviation={g.compact ? 3 : 6} />
        </filter>
      </defs>

      <g className={`climb__roots${grown >= 0 ? ' is-grown' : ''}`} style={{ transformOrigin: `${g.base.x}px ${g.base.y}px` }}>
        <g filter={g.compact ? undefined : 'url(#climb-root-glow)'} className="climb__root-glow">
          {g.roots.filter((root) => root.glow).map((root, i) => (
            <path key={i} d={root.d} />
          ))}
        </g>
        {g.roots.map((root, i) => (
          <path key={i} d={root.d} className="climb__root" />
        ))}
      </g>

      {/* Branches first, so the trunk covers where they join it. */}
      {[...g.sprigs, ...g.branches, ...g.crown].map((b) => (
        <g key={b.key} className={`climb__branch${b.beat <= grown ? ' is-grown' : ''}`} style={{ transformOrigin: `${b.ox}px ${b.oy}px` }}>
          <path d={b.d} />
          <path d={b.leaves[0]} className="climb__leaf" />
          <path d={b.leaves[1]} className="climb__leaf climb__leaf--light" />
        </g>
      ))}

      <g mask="url(#climb-grow)">
        <path d={g.trunk} className="climb__trunk" />
        <path d={g.trunkShade} className="climb__trunk-shade" />
        <path d={g.trunkLight} className="climb__trunk-light" />
      </g>
    </svg>
  )
}

/** Arrows from each beat up to the next. Each glows only while it's on screen, and every card is cut out of the layer. */
export function Links({ g, grown, live }: { g: ClimbGeometry; grown: number; live: Set<number> }) {
  return (
    <svg className="climb__links" width={g.width} height={g.height} viewBox={`0 0 ${g.width} ${g.height}`} aria-hidden>
      <defs>
        <mask id="climb-cards" maskUnits="userSpaceOnUse" x={0} y={0} width={g.width} height={g.height}>
          <rect width={g.width} height={g.height} fill="white" />
          {g.cards.map((c, i) => (
            <rect key={i} x={c.x} y={c.y} width={c.w} height={c.h} rx={16} fill="black" />
          ))}
        </mask>
        {/* Blurred glows are desktop only: on a phone they repaint a page-tall layer every frame. */}
        {g.links.map((l, i) =>
          !g.compact && (live.has(l.beat) || live.has(l.from)) ? (
            <filter key={l.key} id={`climb-glow-${i}`} filterUnits="userSpaceOnUse" x={l.box.x} y={l.box.y} width={l.box.w} height={l.box.h}>
              <feGaussianBlur stdDeviation="3.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          ) : null,
        )}
      </defs>
      {live.has(0) && grown >= 0 && (
        <g className="climb-link climb-link--sap is-live" style={{ '--len': g.sap.len } as CSSProperties}>
          {!g.compact && (
            <>
              <filter id="climb-sap-glow" filterUnits="userSpaceOnUse" x={g.sap.box.x} y={g.sap.box.y} width={g.sap.box.w} height={g.sap.box.h}>
                <feGaussianBlur stdDeviation="7" />
              </filter>
              <path d={g.sap.d} className="climb-link__signal" filter="url(#climb-sap-glow)" />
            </>
          )}
          <path d={g.sap.d} className="climb-link__signal climb-link__signal--core" />
        </g>
      )}
      <g mask="url(#climb-cards)">
        {g.links.map((l, i) => {
          const on = l.from <= grown && (live.has(l.beat) || live.has(l.from))
          return (
            <g
              key={l.key}
              className={`climb-link${l.from <= grown ? ' is-grown' : ''}${on ? ' is-live' : ''}`}
              style={{ '--len': l.len, '--signal-delay': `${(i % 3) * 600}ms` } as CSSProperties}
            >
              <path d={l.d} className="climb-link__line" pathLength={1} />
              {on && (
                <>
                  {!g.compact && <path d={l.d} className="climb-link__signal" filter={`url(#climb-glow-${i})`} />}
                  <path d={l.d} className="climb-link__signal climb-link__signal--core" />
                </>
              )}
              <path d={l.arrow} className="climb-link__arrow" />
            </g>
          )
        })}
      </g>
    </svg>
  )
}
