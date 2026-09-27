import type { ReactNode } from 'react'
import type { RoadmapRow } from '../lib/roadmapLayout.ts'

/** Full course names at phone width. The shared course button still opens its prerequisite sheet. */
export function PhoneRoadmap({ rows, renderCourse }: { rows: RoadmapRow[]; renderCourse: (code: string) => ReactNode }) {
  return (
    <div className="phone-roadmap">
      {rows.map((row) => (
        <section className="phone-roadmap__term" key={row.key} aria-label={row.label}>
          <h3 className="roadmap__row-label">{row.label}</h3>
          {row.internship ? (
            <div className="roadmap__internship"><strong>Internship year</strong><span>Your plan keeps this year free of courses.</span></div>
          ) : <div className="phone-roadmap__courses">{row.codes.map(renderCourse)}</div>}
        </section>
      ))}
    </div>
  )
}
