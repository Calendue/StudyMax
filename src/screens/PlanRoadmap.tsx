import { useMemo, useState } from 'react'
import { useModel } from '../model.ts'
import { courseCode } from '../format.ts'
import { catalogueUrl } from '../lib/courseSearch.ts'
import { haptic } from '../platform.ts'
import {
  buildRoadmapLayout,
  columnX,
  nodeCenterY,
  COLUMN_WIDTH,
  COLUMN_GAP,
  HEADER_HEIGHT,
  NODE_HEIGHT,
  NODE_GAP,
  type RoadmapColumn,
  type RoadmapNodeLayout,
} from '../lib/roadmapLayout.ts'
import { Appear, Chip } from '../ui/primitives.tsx'
import { Icon } from '../ui/Icon.tsx'
import { Sheet } from '../ui/Sheet.tsx'

/**
 * The visual node/edge view of the term-by-term plan: courses as nodes grouped into term columns,
 * prerequisite links as connectors. Consumes `buildPlan`'s existing output as-is (via `m.plan`) —
 * this owns layout and interaction only, no scheduling logic of its own.
 */
export function PlanRoadmap() {
  const m = useModel()

  // Completed courses that count toward what's being planned — shown as a leading, collapsed
  // "Completed" column so the graph reads as a full journey, not just what's left.
  const completedRelevant = useMemo(() => {
    const relevant = new Set<string>()
    for (const target of m.targets) {
      for (const group of target.spec.requirements) {
        for (const code of group.courses) {
          if (m.completed.has(code)) relevant.add(code)
        }
      }
    }
    return [...relevant]
  }, [m.targets, m.completed])

  const { columns, nodes, edges } = useMemo(
    () => buildRoadmapLayout(m.plan, completedRelevant),
    [m.plan, completedRelevant],
  )
  const nodesByCode = useMemo(() => new Map(nodes.map((n) => [n.code, n])), [nodes])

  const [completedCollapsed, setCompletedCollapsed] = useState(true)
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

  if (columns.length === 0) return null

  function selectCourse(code: string) {
    haptic.selection()
    setActiveCode(code)
  }

  const maxRows = Math.max(1, ...columns.map((c) => (c.collapsible && completedCollapsed ? 0 : c.codes.length)))
  const width = columnX(columns.length - 1) + COLUMN_WIDTH
  const height = HEADER_HEIGHT + maxRows * (NODE_HEIGHT + NODE_GAP)

  return (
    <Appear index={3} className="roadmap">
      <div className="roadmap__scroll">
        <div className="roadmap__track" style={{ width, gap: COLUMN_GAP }}>
          <svg className="roadmap__edges" width={width} height={height} aria-hidden>
            {edges.map((edge) => {
              const from = nodesByCode.get(edge.from)
              const to = nodesByCode.get(edge.to)
              if (!from || !to) return null
              const sx = columnX(from.col) + COLUMN_WIDTH
              const sy = nodeCenterY(from.row)
              const tx = columnX(to.col)
              const ty = nodeCenterY(to.row)
              const midX = (sx + tx) / 2
              const active = connectedCodes ? connectedCodes.has(edge.from) && connectedCodes.has(edge.to) : false
              return (
                <path
                  key={`${edge.from}->${edge.to}`}
                  d={`M ${sx} ${sy} C ${midX} ${sy}, ${midX} ${ty}, ${tx} ${ty}`}
                  className={`roadmap__edge${active ? ' roadmap__edge--active' : ''}`}
                />
              )
            })}
          </svg>
          {columns.map((column) => (
            <RoadmapColumnView
              key={column.key}
              column={column}
              nodesByCode={nodesByCode}
              collapsed={column.collapsible && completedCollapsed}
              onToggleCollapse={() => setCompletedCollapsed((c) => !c)}
              connectedCodes={connectedCodes}
              activeCode={activeCode}
              onSelect={selectCourse}
              courseTitle={m.courseTitle}
            />
          ))}
        </div>
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

function RoadmapColumnView({
  column,
  nodesByCode,
  collapsed,
  onToggleCollapse,
  connectedCodes,
  activeCode,
  onSelect,
  courseTitle,
}: {
  column: RoadmapColumn
  nodesByCode: Map<string, RoadmapNodeLayout>
  collapsed: boolean
  onToggleCollapse: () => void
  connectedCodes: Set<string> | null
  activeCode: string | null
  onSelect: (code: string) => void
  courseTitle: (code: string) => string | undefined
}) {
  return (
    <div className="roadmap__column" style={{ width: COLUMN_WIDTH }}>
      <p className="roadmap__column-label">{column.label}</p>
      {column.collapsible && collapsed ? (
        <button type="button" className="roadmap__summary" onClick={onToggleCollapse}>
          {column.codes.length} done
          <Icon name="chevron" size={14} />
        </button>
      ) : (
        <div className="roadmap__nodes">
          {column.collapsible && (
            <button type="button" className="roadmap__collapse" onClick={onToggleCollapse}>
              Collapse
            </button>
          )}
          {column.codes.map((code) => {
            const node = nodesByCode.get(code)
            if (!node) return null
            const connected = connectedCodes?.has(code) ?? false
            const dimmed = connectedCodes !== null && !connected
            return (
              <RoadmapNodeView
                key={code}
                node={node}
                title={courseTitle(code)}
                active={activeCode === code}
                dimmed={dimmed}
                onSelect={() => onSelect(code)}
              />
            )
          })}
        </div>
      )}
    </div>
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
      {node.alsoAdvances.length > 0 && <span className="roadmap__node-dot" aria-hidden />}
      <span className="roadmap__node-code">{courseCode(node.code)}</span>
      <span className="roadmap__node-title">{title}</span>
    </button>
  )
}
