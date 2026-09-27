import type { CSSProperties } from 'react'
import type { SkillTreeLayout } from '../lib/skillTree.ts'

/**
 * The whole degree at the top of the canopy: credit units done out of the degree's total, and each
 * requirement block (C1-C5) as a chip that's done, covered by the plan, or still short.
 */
export function DegreeReadout({ box }: { box: NonNullable<SkillTreeLayout['degree']> }) {
  const d = box.progress
  return (
    <section
      className="tree-degree"
      style={{ left: box.x, top: box.y, width: box.w, height: box.h } as CSSProperties}
      aria-label={`${d.name}: ${d.doneCu} of ${d.totalCu} credit units done`}
    >
      <p className="tree-degree__name">{d.name}</p>
      <p className="tree-degree__total">
        <strong>{d.doneCu}</strong> of {d.totalCu} cu
        <span>
          {d.inProgressCu > 0 && ` · ${d.inProgressCu} now`}
          {d.plannedCu > 0 && ` · ${d.plannedCu} planned`}
        </span>
      </p>
      <ul className="tree-degree__blocks">
        {d.blocks.map((b) => {
          const left = Math.max(0, b.needCu - b.doneCu)
          const state = left === 0 ? 'done' : b.doneCu + b.plannedCu >= b.needCu ? 'planned' : 'short'
          const words = left === 0 ? 'done' : state === 'planned' ? `${left} cu left, in the plan` : `${left} cu left`
          return (
            <li key={b.id} className={`tree-degree__block tree-degree__block--${state}`} title={`${b.id} ${b.label}: ${words}`}>
              <span className="tree-degree__id">{b.id}</span>
              {left === 0 ? (
                <svg className="tree-degree__tick" viewBox="0 0 12 12" aria-hidden>
                  <path d="M2.5 6.3 5 8.7l4.6-5" />
                </svg>
              ) : (
                <span aria-hidden>{left} left</span>
              )}
              <span className="visually-hidden">
                {b.label}: {words}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
