import type { PlannedTerm, Season } from './plan.ts'

// The courses a student is taking now, by term, and how they sit in the plan's timeline. The plan
// itself only schedules what's left; this puts the courses already under way back into it, so the
// roadmap shows the same classes the Courses page does.

const RANK: Record<Season, number> = { Winter: 0, 'Spring/Summer': 1, Fall: 2 }

/** The term running today: Jan–Apr Winter, May–Aug Spring/Summer, Sep–Dec Fall. */
export function seasonNow(today: Date): Season {
  const month = today.getMonth()
  return month >= 8 ? 'Fall' : month >= 4 ? 'Spring/Summer' : 'Winter'
}

/** "Fall 2026": the season's current or next occurrence. One already past this year is next year's. */
export function termLabel(season: Season, today: Date): string {
  const year = today.getFullYear()
  return `${season} ${RANK[season] < RANK[seasonNow(today)] ? year + 1 : year}`
}

/** "Winter 2027" → a sortable number. */
function termOrder(label: string): number {
  const match = label.match(/^(Fall|Winter|Spring\/Summer) (\d{4})$/)
  return match ? Number(match[2]) * 10 + RANK[match[1] as Season] : Number.MAX_SAFE_INTEGER
}

/** In-progress courses by term label, for the planner to count against each term's room. */
export function bookedByTerm(current: { season: Season; courses: string[] }[], today: Date): Record<string, string[]> {
  return Object.fromEntries(current.map((g) => [termLabel(g.season, today), g.courses]))
}

/**
 * The plan with the student's in-progress courses placed in their terms, ahead of what the plan adds
 * there. A term the plan doesn't reach (the one running now, usually) gets its own row.
 */
export function withCurrentCourses(
  plan: PlannedTerm[],
  current: { season: Season; courses: string[] }[],
  today: Date,
): PlannedTerm[] {
  const byLabel = new Map(plan.map((t) => [t.label, { ...t, courses: [...t.courses] }]))
  for (const group of current) {
    const label = termLabel(group.season, today)
    const term = byLabel.get(label) ?? { label, courses: [] }
    term.courses = [...group.courses.map((code) => ({ code, reason: 'registered' as const, alsoAdvances: [] })), ...term.courses]
    byLabel.set(label, term)
  }
  return [...byLabel.values()].sort((a, b) => termOrder(a.label) - termOrder(b.label))
}
