import type { CSSProperties } from 'react'
import { courseCode, KIND_LABEL } from '../format.ts'
import type { SkillTreeLayout } from '../lib/skillTree.ts'
import { Icon } from '../ui/Icon.tsx'
import { Ring } from '../ui/primitives.tsx'
import { statusLabel, type TreeSelection } from './planView.ts'
import { Swatch } from './TreeDetail.tsx'
import { useElectivePicks } from '../lib/electivePicks.ts'

function Codes({ label, codes, onSelect, arrow }: { label: string; codes: string[]; onSelect: (code: string) => void; arrow?: boolean }) {
  if (codes.length === 0) return null
  return (
    <div className="tree-peek__row">
      <span className="tree-peek__label">
        {arrow && (
          <svg className="tree__key-arrow" width="8" height="11" viewBox="0 0 10 14" aria-hidden>
            <path d="M5 13V5" />
            <path d="M1 6 5 1l4 5Z" />
          </svg>
        )}
        {label}
      </span>
      <div className="tree-peek__codes">
        {codes.map((code) => (
          <button key={code} type="button" className="chip chip--quiet tree-peek__code-chip" onClick={() => onSelect(code)}>
            {courseCode(code)}
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * The phone's answer to a tap on the tree: a slim card over the tab bar instead of a sheet over the
 * tree, so the course's arrows stay in view. It says what the arrows say (what the course needs,
 * what it unlocks), and Details opens the full sheet.
 */
export function TreePeek({
  layout,
  selection,
  title,
  onSelect,
  onDetails,
  onClose,
}: {
  layout: SkillTreeLayout
  selection: TreeSelection
  title: string | undefined
  onSelect: (next: TreeSelection) => void
  onDetails: () => void
  onClose: () => void
}) {
  const picks = useElectivePicks()
  const toCourse = (code: string) => onSelect({ kind: 'node', code })
  const node = selection.kind === 'node' ? layout.nodes.find((n) => n.code === selection.code) : undefined
  const leaf = selection.kind === 'leaf' ? layout.leaves[selection.index] : undefined
  if (!node && !leaf) return null

  return (
    <div className="tree-peek" role="region" aria-label={node ? `${courseCode(node.code)} on the tree` : leaf!.name}>
      <div className="tree-peek__head">
        {node ? (
          <div className="tree-peek__id">
            <p className="tree-peek__name">{courseCode(picks[node.code] ?? node.code)}</p>
            <p className="tree-peek__status">
              <Swatch kind={node.elective ? 'elective' : node.status} />
              {node.elective ? `Elective · ${statusLabel(node)}` : statusLabel(node)}
              {node.status === 'inProgress' && !node.current && ` · ${node.term}`}
            </p>
          </div>
        ) : (
          <div className="tree-peek__id tree-peek__id--leaf" style={{ '--hue': `var(--tree-cred-${leaf!.index + 1})` } as CSSProperties}>
            <Ring done={leaf!.done} total={leaf!.total} size={40} stroke={4} />
            <div>
              <p className="tree-peek__name">{leaf!.name}</p>
              <p className="tree-peek__status">
                {KIND_LABEL[leaf!.kind]} · {leaf!.done} of {leaf!.total} done
              </p>
            </div>
          </div>
        )}
        <button type="button" className="tree-peek__more" onClick={onDetails}>
          Details
          <Icon name="chevron" size={16} />
        </button>
        <button type="button" className="tree-peek__close" aria-label="Close" onClick={onClose}>
          <Icon name="close" size={18} />
        </button>
      </div>
      {node && title && <p className="tree-peek__title">{title}</p>}
      {node && (
        <>
          <Codes label="Needs" codes={node.prereqs} onSelect={toCourse} />
          {node.prereqs.length === 0 && node.needsCredits && <p className="tree-peek__title">Needs {node.needsCredits} first</p>}
          <Codes label="Unlocks" codes={node.unlocks} onSelect={toCourse} arrow />
        </>
      )}
      {leaf?.next && <Codes label="Next" codes={[leaf.next]} onSelect={toCourse} />}
    </div>
  )
}
