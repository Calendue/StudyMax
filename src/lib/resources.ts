import type { Resource } from '../data/schools/types.ts'

/**
 * Ranks resources by nearest deadline first. Rolling/ongoing (no deadlineDate) sort last — and so do
 * deadlines that have already passed, which are the one thing worse than no date: a closed award at
 * the top of the list reads as the most urgent thing on the page.
 */
export function rankByUrgency(resources: Resource[], today: Date = new Date()): Resource[] {
  // 0 = still open and dated, 1 = rolling/ongoing, 2 = the deadline has already gone by.
  const tier = (r: Resource) => (daysUntil(r, today) !== null ? 0 : r.deadlineDate ? 2 : 1)

  return [...resources].sort(
    (a, b) =>
      tier(a) - tier(b) ||
      (tier(a) === 0 ? a.deadlineDate!.localeCompare(b.deadlineDate!) : 0) ||
      a.name.localeCompare(b.name),
  )
}

/**
 * Calendar days from `today` until the resource's deadline day: 0 on the day itself, 1 the day before.
 * null for rolling/ongoing or past deadlines. Counted between local midnights, so the time of day
 * never pushes a same-day deadline to "tomorrow", and DST's 23/25-hour days round away.
 */
export function daysUntil(resource: Resource, today: Date = new Date()): number | null {
  if (!resource.deadlineDate) return null
  const [year, month, day] = resource.deadlineDate.split('-').map(Number)
  const deadline = new Date(year, month - 1, day)
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const days = Math.round((deadline.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
  return days >= 0 ? days : null
}

export type UrgencyTier = 'urgent' | 'soon' | 'distant' | 'none'

/** Urgent ≤14 days, soon ≤60 days, distant beyond that, none when there's no countable deadline. */
export function urgencyTier(days: number | null): UrgencyTier {
  if (days === null) return 'none'
  if (days <= 14) return 'urgent'
  if (days <= 60) return 'soon'
  return 'distant'
}

/** "Closes today" / "Closes tomorrow" / "Closes in N days" — null input yields ''. */
export function formatCountdown(days: number | null): string {
  if (days === null) return ''
  if (days === 0) return 'Closes today'
  if (days === 1) return 'Closes tomorrow'
  return `Closes in ${days} days`
}
