import { useLayoutEffect, useMemo, useRef, useState } from 'react'
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
export function PlanRoadmap() {
  const m = useModel()

  // Completed and in-progress courses that count toward what's being planned, so the graph reads
  // as a whole journey rather than only what's left. The plan counts in-progress courses as passed
  // by its first term, so without this list they would appear nowhere.
  const { completedRelevant, inProgressRelevant } = useMemo(() => {
    const counted = new Set(m.targets.flatMap((t) => t.spec.requirements.flatMap((g) => g.courses)))
    return {
      completedRelevant: [...counted].filter((code) => m.completed.has(code)).sort(),
      inProgressRelevant: m.uploadInProgress.filter((code) => counted.has(code) && !m.completed.has(code)).sort(),
    }
  }, [m.targets, m.completed, m.uploadInProgress])
  const doneSummary =
    (completedRelevant.length > 0 ? `${plural(completedRelevant.length, 'course')} already done` : '') +
    (completedRelevant.length > 0 && inProgressRelevant.length > 0 ? ' and ' : '') +
    (inProgressRelevant.length > 0
      ? `${completedRelevant.length > 0 ? inProgressRelevant.length : plural(inProgressRelevant.length, 'course')} in progress`
      : '') +
    ' toward this'

  const { rows, nodes, edges } = useMemo(() => buildRoadmapLayout(m.plan), [m.plan])
  const nodesByCode = useMemo(() => new Map(nodes.map((n) => [n.code, n])), [nodes])

  const [doneOpen, setDoneOpen] = useState(false)
  const [activeCode, setActiveCode] = useState<string | null>(null)
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
      {completedRelevant.length + inProgressRelevant.length > 0 && (
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
              {inProgressRelevant.map((code) => (
                <span key={code} className="chip chip--quiet roadmap__in-progress" title={m.courseTitle(code)}>
                  {courseCode(code)} · in progress
                </span>
              ))}
            </div>
          )}
          {doneOpen && inProgressRelevant.length > 0 && (
            <p className="footnote">
              The plan counts in-progress courses as passed from {m.startTerm.season} {m.startTerm.year}.
            </p>
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
              className="roadmap__row-nodes"
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

      <Sheet open={activeNode !== undefined} onClose={() => setActiveCode(null)} title={activeCode ? courseCode(activeCode) : ''}>
        {activeNode && activeCode && (
          <>
            <p className="lead">{m.courseTitle(activeCode)}</p>
            {activeNode.state === 'prerequisite' && (
              <p className="footnote">
                <Chip>Prerequisite</Chip> Needed before {courseCode(activeNode.neededBy ?? '')}
                {activeNode.prerequisiteText ? `, which requires ${activeNode.prerequisiteText}` : ''}
              </p>
            )}
            {activeNode.alsoAdvances.length > 0 && (
              <p className="footnote">Also counts toward {activeNode.alsoAdvances.join(', ')}</p>
            )}
            <a className="btn btn--secondary btn--block" href={catalogueUrl(activeCode)} target="_blank" rel="noreferrer">
              <Icon name="external" size={20} />
              Open in catalogue
            </a>
          </>
        )}
      </Sheet>
    </Appear>
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
        <span className="roadmap__node-code">{courseCode(node.code)}</span>
        {node.alsoAdvances.length > 0 && (
          <span className="roadmap__node-dot" title={`Also counts toward ${node.alsoAdvances.join(', ')}`} />
        )}
        {node.state === 'prerequisite' && <span className="roadmap__node-tag">Prereq</span>}
      </span>
      <span className="roadmap__node-title">{title}</span>
    </button>
  )
}
