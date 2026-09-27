import type { CSSProperties } from 'react'
import { isElective } from '../lib/plan.ts'
import { useModel } from '../model.ts'
import { courseCode, KIND_LABEL, plural } from '../format.ts'
import { courseInfo } from '../data/prereqs.ts'
import { haptic } from '../platform.ts'
import type { SkillTreeLayout, TreeNode } from '../lib/skillTree.ts'
import { Button, Ring } from '../ui/primitives.tsx'
import { STATUS_LABEL, type TreeSelection } from './planView.ts'

export function Swatch({ kind, hue }: { kind?: string; hue?: number }) {
  return (
    <span
      className={`tree-swatch${kind ? ` tree-swatch--${kind}` : ''}`}
      style={hue === undefined ? undefined : ({ '--hue': `var(--tree-cred-${hue + 1})` } as CSSProperties)}
      aria-hidden
    />
  )
}

function CodeChips({ codes, onSelect }: { codes: string[]; onSelect: (code: string) => void }) {
  return (
    <div className="tree-detail__chips">
      {codes.map((code) => (
        <button key={code} type="button" className="chip chip--quiet" onClick={() => onSelect(code)}>
          {courseCode(code)}
        </button>
      ))}
    </div>
  )
}

/**
 * What a course or a leaf on the tree means. App chrome, so it wears the normal StudyMax theme; the
 * board's language comes along as small swatches (status, credential hues).
 */
export function TreeDetail({
  layout,
  selection,
  onSelect,
}: {
  layout: SkillTreeLayout
  selection: TreeSelection
  onSelect: (next: TreeSelection) => void
}) {
  const m = useModel()
  const toCourse = (code: string) => onSelect({ kind: 'node', code })

  if (selection.kind === 'leaf') {
    const leaf = layout.leaves[selection.index]
    if (!leaf) return null
    const on = (status: TreeNode['status'][]) =>
      layout.nodes.filter((n) => leaf.codes.includes(n.code) && status.includes(n.status)).map((n) => n.code)
    const done = on(['completed'])
    const now = on(['inProgress'])
    const ahead = on(['next', 'planned', 'locked'])
    return (
      <div className="tree-detail">
        <div className="tree-detail__leaf">
          <Ring done={leaf.done} total={leaf.total} size={56} stroke={5} />
          <div>
            <p className="tree-detail__status">
              <Swatch hue={leaf.index} />
              {KIND_LABEL[leaf.kind]}
              {!leaf.planned && ' · partway, not planned yet'}
            </p>
            <p className="lead tree-detail__lead">
              {leaf.done} of {leaf.total} done
              {leaf.next && (
                <>
                  {' · next: '}
                  <button type="button" className="inline-link" onClick={() => toCourse(leaf.next!)}>
                    {courseCode(leaf.next)}
                  </button>
                </>
              )}
            </p>
          </div>
        </div>
        {done.length > 0 && (
          <section className="tree-detail__section">
            <h3>Done on this branch</h3>
            <CodeChips codes={done} onSelect={toCourse} />
          </section>
        )}
        {now.length > 0 && (
          <section className="tree-detail__section">
            <h3>In progress</h3>
            <CodeChips codes={now} onSelect={toCourse} />
          </section>
        )}
        {ahead.length > 0 && (
          <section className="tree-detail__section">
            <h3>Still to take</h3>
            <CodeChips codes={ahead} onSelect={toCourse} />
          </section>
        )}
        {!leaf.planned && m.addableTargets.some((t) => t.spec.id === leaf.id) && (
          <Button
            block
            variant="secondary"
            icon="plus"
            onClick={() => {
              haptic.light()
              m.setExtraTargetIds((ids) => [...ids, leaf.id])
            }}
          >
            Plan it alongside
          </Button>
        )}
      </div>
    )
  }

  const node = layout.nodes.find((n) => n.code === selection.code)
  if (!node) return null
  const info = courseInfo[node.code]
  const title = m.courseTitle(node.code)
  const statusKind = node.elective && node.status !== 'next' ? 'elective' : node.status
  const when =
    node.status === 'completed'
      ? node.termKnown
        ? `Passed in ${node.term}.`
        : `Year ${node.year}, ${node.lane === 'fall' ? 'Fall' : 'Winter'} side. Placed by course level: no term was given for it.`
      : node.status === 'inProgress'
        ? node.later
          ? `Registered for ${node.term}`
          : `Now, ${node.term}`
        : node.term
  const done = m.completed.has(node.code)
  return (
    <div className="tree-detail">
      {title && <p className="lead tree-detail__lead">{title}</p>}
      <p className="tree-detail__status">
        <Swatch kind={statusKind} />
        {node.elective && node.status !== 'next' ? 'Elective' : STATUS_LABEL[node.status]}
      </p>
      <p className="tree-detail__when">{when}</p>
      {info && info.creditUnits > 0 && <p className="footnote">{plural(info.creditUnits, 'credit unit')}</p>}
      {node.status === 'next' && (
        <p className="footnote">Of everything still to take, this one counts toward the most credentials at once.</p>
      )}
      {node.status === 'locked' && <p className="footnote">Locked until the courses below it on the tree are done.</p>}

      {isElective(node.code) && (
        <p className="footnote">
          Your degree needs a course of this kind here. Any one that fits counts, so pick it when you register.
        </p>
      )}

      {node.elective && !isElective(node.code) && (
        <section className="tree-detail__section">
          <h3>
            Elective · {node.elective.need} of {node.elective.of}
          </h3>
          <p className="footnote">
            Any {node.elective.need === 1 ? 'one' : node.elective.need} of these counts. We suggested {courseCode(node.code)}{' '}
            because it counts toward the most other credentials.
          </p>
          <div className="tree-detail__chips">
            {node.elective.options.map((code) => (
              <span key={code} className={`chip chip--quiet${code === node.code ? ' tree-detail__pick' : ''}`}>
                {courseCode(code)}
              </span>
            ))}
          </div>
        </section>
      )}

      {!isElective(node.code) && (
        <section className="tree-detail__section">
          <h3>Prerequisites</h3>
          {info?.prerequisiteText ? <p className="footnote">{info.prerequisiteText}</p> : <p className="footnote">None listed in the catalogue.</p>}
          {node.prereqs.length > 0 && <CodeChips codes={node.prereqs} onSelect={toCourse} />}
        </section>
      )}

      {node.unlocks.length > 0 && (
        <section className="tree-detail__section">
          <h3>Unlocks</h3>
          <CodeChips codes={node.unlocks} onSelect={toCourse} />
        </section>
      )}

      {node.creds.length > 0 && (
        <section className="tree-detail__section">
          <h3>Counts toward</h3>
          <ul className="tree-detail__creds">
            {node.creds.map((c) => (
              <li key={c}>
                <button type="button" className="inline-link" onClick={() => onSelect({ kind: 'leaf', index: c })}>
                  <Swatch hue={c} />
                  {layout.leaves[c]?.name}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Button
        block
        variant={done ? 'secondary' : 'primary'}
        icon={done ? 'restart' : 'check'}
        onClick={() => {
          haptic.light()
          m.toggleCourse(node.code)
        }}
      >
        {done ? 'Undo: not done yet' : 'Mark done'}
      </Button>
    </div>
  )
}
