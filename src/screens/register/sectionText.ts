import { formatBannerTime } from '../../lib/classTracker.ts'
import { typeWord } from '../../lib/mockRegistration.ts'
import type { RegMeeting } from '../../lib/registration.ts'

// How a section reads on the Register screen and in the practice run.

/** "13:30" -> "1:30 PM". */
export function timeText(t: string): string {
  return formatBannerTime(t.replace(':', '')) ?? t
}

/** "Lecture 04", "Lab L04", "Tutorial T02". */
export function sectionName(s: { type: string; section: string }): string {
  return `${typeWord(s.type)} ${s.section}`
}

/**
 * "Mon Wed Fri · 10:30 AM – 11:20 AM". Meetings at the same time on different days read as one (a
 * lecture Banner lists as MW and F); different times join with a semicolon.
 */
export function meetingsText(meetings: RegMeeting[]): string {
  if (meetings.length === 0) return 'No set meeting time'
  const byTime = new Map<string, string[]>()
  for (const mt of meetings) {
    const key = `${mt.start}-${mt.end}`
    byTime.set(key, [...(byTime.get(key) ?? []), ...mt.days])
  }
  return [...byTime.entries()]
    .map(([key, days]) => {
      const [start, end] = key.split('-')
      return `${sortDays(days).join(' ')} · ${timeText(start)} – ${timeText(end)}`
    })
    .join('; ')
}

const WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function sortDays(days: string[]): string[] {
  return [...new Set(days)].sort((a, b) => WEEK.indexOf(a) - WEEK.indexOf(b))
}

/** "2:04 AM", or "Sep 26, 2:04 AM" when the reading is from another day. */
export function readingTime(iso: string, now = new Date()): string {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return 'an earlier check'
  const sameDay = at.toDateString() === now.toDateString()
  return new Intl.DateTimeFormat(undefined, {
    ...(sameDay ? {} : { month: 'short', day: 'numeric' }),
    hour: 'numeric',
    minute: '2-digit',
  }).format(at)
}
