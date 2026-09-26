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
 * Calendar days from `today` to the resource's deadline: 0 = closes today, 1 = tomorrow. null for
 * rolling/ongoing or past deadlines. Counting whole dates rather than rounding elapsed time up keeps
 * this in step with formatCountdown's wording at every hour of the day (rounding up said "Closes
 * tomorrow" on the deadline itself), and it's the same rule the widgets and the deadline watch use.
 */
export function daysUntil(resource: Resource, today: Date = new Date()): number | null {
  if (!resource.deadlineDate) return null
  const [y, m, d] = resource.deadlineDate.split('-').map(Number)
  // Both as UTC midnights, so a daylight-saving change in between can't shift the count.
  const due = Date.UTC(y, m - 1, d)
  const now = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
  const days = Math.round((due - now) / 86_400_000)
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
