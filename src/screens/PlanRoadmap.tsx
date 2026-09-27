import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { isElective } from '../lib/plan.ts'
import { useModel } from '../model.ts'
import { courseCode, plural } from '../format.ts'
import { catalogueUrl } from '../lib/courseSearch.ts'
import { haptic } from '../platform.ts'
import {
  buildRoadmapLayout,
  graphHeight,
  nodeBox,
  LABEL_HEIGHT,
  NODE_GAP,
  NODE_HEIGHT,
  ROW_GAP,
  ROW_PITCH,
  type RoadmapNodeLayout,
} from '../lib/roadmapLayout.ts'
import { Appear, Chip } from '../ui/primitives.tsx'
import { Icon } from '../ui/Icon.tsx'
import { Sheet } from '../ui/Sheet.tsx'

/**
 * The visual node/edge view of the term-by-term plan: terms stacked top to bottom, each term's
 * courses sharing the full width, prerequisite links flowing down between them. Consumes
 * `buildPlan`'s existing output as-is (via `m.plan`) — this owns layout and interaction only.
 */
export interface RoadmapSelection {
  code: string
  node: RoadmapNodeLayout
}

/**
 * On a phone a tapped course opens a sheet. The desktop's Plan page passes `onSelect` instead and
 * shows the course in its side panel, so the roadmap is controlled and draws no sheet of its own.
 */
export function PlanRoadmap({ selected, onSelect }: { selected?: string | null; onSelect?: (sel: RoadmapSelection | null) => void } = {}) {
  const m = useModel()

  // Completed courses that count toward what's being planned, listed above the graph so it reads
  // as a whole journey rather than only what's left.
  const completedRelevant = useMemo(() => {
    const counted = new Set(m.targets.flatMap((t) => t.spec.requirements.flatMap((g) => g.courses)))
    return [...counted].filter((code) => m.completed.has(code)).sort()
  }, [m.targets, m.completed])
  // In-progress courses are drawn in their terms on the roadmap, so this only lists what's finished.
  const doneSummary = `${plural(completedRelevant.length, 'course')} already done toward this`

  // The roadmap, not the bare plan: the courses already under way sit in their terms too.
  const { rows, nodes, edges } = useMemo(() => buildRoadmapLayout(m.roadmap), [m.roadmap])
  const nodesByCode = useMemo(() => new Map(nodes.map((n) => [n.code, n])), [nodes])

  const [doneOpen, setDoneOpen] = useState(false)
  const [ownActive, setOwnActive] = useState<string | null>(null)
  const controlled = onSelect !== undefined
  const activeCode = controlled ? (selected ?? null) : ownActive
  const setActiveCode = (code: string | null) => {
    if (!controlled) return setOwnActive(code)
    const node = code ? nodesByCode.get(code) : undefined
    onSelect(code && node ? { code, node } : null)
  }
  const activeNode = activeCode ? nodesByCode.get(activeCode) : undefined

  const connectedCodes = useMemo(() => {
    if (!activeCode) return null
    const connected = new Set<string>([activeCode])
    for (const edge of edges) {
      if (edge.from === activeCode) connected.add(edge.to)
      if (edge.to === activeCode) connected.add(edge.from)
    }
    return connected
  }, [edges, activeCode])

  // Connectors are drawn in pixels, so the graph measures its own width and redraws on resize.
  const graphRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const hasRows = rows.length > 0
  useLayoutEffect(() => {
    const el = graphRef.current
    if (!el) return
    setWidth(el.clientWidth)
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasRows])

  if (!hasRows) return null

  function selectCourse(code: string) {
    haptic.selection()
    setActiveCode(code)
  }

  const height = graphHeight(rows.length)

  return (
    <Appear index={3} className="roadmap">
      {completedRelevant.length > 0 && (
        <div className="roadmap__done">
          <button
            type="button"
            className="roadmap__done-toggle"
            aria-expanded={doneOpen}
            onClick={() => setDoneOpen((open) => !open)}
          >
            <span>
              <Icon name="check" size={18} />
              {doneSummary}
            </span>
            <Icon name="chevron" size={18} />
          </button>
          {doneOpen && (
            <div className="roadmap__done-list">
              {completedRelevant.map((code) => (
                <span key={code} className="chip chip--quiet" title={m.courseTitle(code)}>
                  {courseCode(code)}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="roadmap__graph" ref={graphRef} style={{ height }}>
        {width > 0 && (
          <svg className="roadmap__edges" width={width} height={height} aria-hidden>
            {edges.map((edge) => {
              const from = nodesByCode.get(edge.from)
              const to = nodesByCode.get(edge.to)
              if (!from || !to) return null
              const a = nodeBox(from, width)
              const b = nodeBox(to, width)
              const sx = a.x + a.w / 2
              const sy = a.y + a.h
              const tx = b.x + b.w / 2
              const ty = b.y
              const bend = ROW_GAP * 0.9
              const active = connectedCodes ? connectedCodes.has(edge.from) && connectedCodes.has(edge.to) : false
              return (
                <g key={`${edge.from}->${edge.to}`} className={`roadmap__edge${active ? ' roadmap__edge--active' : ''}`}>
                  <path d={`M ${sx} ${sy} C ${sx} ${sy + bend}, ${tx} ${ty - bend}, ${tx} ${ty}`} />
                  <circle cx={tx} cy={ty} r={3.5} />
                </g>
              )
            })}
          </svg>
        )}

        {rows.map((row, i) => (
          <div key={row.key} className="roadmap__row" style={{ top: i * ROW_PITCH }}>
            <p className="roadmap__row-label" style={{ height: LABEL_HEIGHT }}>
              {row.label}
            </p>
            <div
              // A full term (4-5 courses) shares a phone's width five ways: smaller type so codes fit.
              className={`roadmap__row-nodes${row.codes.length >= 4 ? ' roadmap__row-nodes--dense' : ''}`}
              style={{ gridTemplateColumns: `repeat(${row.codes.length}, minmax(0, 1fr))`, gap: NODE_GAP, height: NODE_HEIGHT }}
            >
              {row.codes.map((code) => {
                const node = nodesByCode.get(code)
                if (!node) return null
                return (
                  <RoadmapNodeView
                    key={code}
                    node={node}
                    title={m.courseTitle(code)}
                    active={activeCode === code}
                    dimmed={connectedCodes !== null && !connectedCodes.has(code)}
                    onSelect={() => selectCourse(code)}
                  />
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {!controlled && (
        <Sheet open={activeNode !== undefined} onClose={() => setActiveCode(null)} title={activeCode ? courseCode(activeCode) : ''}>
          {activeNode && activeCode && <CourseDetail code={activeCode} node={activeNode} />}
        </Sheet>
      )}
    </Appear>
  )
}

/** One planned course: its title, why it's there, what else it counts toward, and the catalogue. */
export function CourseDetail({ code, node }: RoadmapSelection) {
  const m = useModel()
  return (
    <>
      <p className="lead">{m.courseTitle(code)}</p>
      {node.state === 'registered' && (
        <p className="footnote">
          <Chip>In progress</Chip> You&rsquo;re taking this now. The plan builds on it rather than scheduling it again.
        </p>
      )}
      {node.state === 'prerequisite' && (
        <p className="footnote">
          <Chip>Prerequisite</Chip> Needed before {courseCode(node.neededBy ?? '')}
          {node.prerequisiteText ? `, which requires ${node.prerequisiteText}` : ''}
        </p>
      )}
      {node.alsoAdvances.length > 0 && <p className="footnote">Also counts toward {node.alsoAdvances.join(', ')}</p>}
      {isElective(code) ? (
        <p className="footnote">Your degree needs a course of this kind here. Any one that fits counts.</p>
      ) : (
        <a className="btn btn--secondary btn--block course-detail__link" href={catalogueUrl(code)} target="_blank" rel="noreferrer">
          <Icon name="external" size={20} />
          Open in catalogue
        </a>
      )}
    </>
  )
}

function RoadmapNodeView({
  node,
  title,
  active,
  dimmed,
  onSelect,
}: {
  node: RoadmapNodeLayout
  title: string | undefined
  active: boolean
  dimmed: boolean
  onSelect: () => void
}) {
  const classes = ['roadmap__node', `roadmap__node--${node.state}`]
  if (active) classes.push('roadmap__node--active')
  if (dimmed) classes.push('roadmap__node--dimmed')

  return (
    <button type="button" className={classes.join(' ')} onClick={onSelect}>
      <span className="roadmap__node-head">
        <span className={`roadmap__node-code${isElective(node.code) ? ' roadmap__node-code--elective' : ''}`}>
          {courseCode(node.code)}
        </span>
        {node.alsoAdvances.length > 0 && (
          <span className="roadmap__node-dot" title={`Also counts toward ${node.alsoAdvances.join(', ')}`} />
        )}
        {node.state === 'prerequisite' && <span className="roadmap__node-tag">Prereq</span>}
        {node.state === 'registered' && <span className="roadmap__node-tag">In progress</span>}
      </span>
      <span className="roadmap__node-title">{isElective(node.code) ? 'Your choice' : title}</span>
    </button>
  )
}
