import { useMemo } from 'react'
import { useModel } from '../model.ts'
import { courseCode } from '../format.ts'
import { daysUntil, formatCountdown } from '../lib/resources.ts'
import { searchCourses } from '../lib/courseSearch.ts'
import type { IconName } from '../ui/Icon.tsx'
import { DESTINATIONS, type Destination } from '../ui/layout.ts'

// What the desktop header shows, derived from the model: the notifications and the search. Both are
// real data only; nothing here is invented for the demo.

/** Award deadlines this close count as a notification. */
const SOON_DAYS = 14

/** Which destination is lit: the courses screen is Courses, the call belongs to Awards. */
export function useActiveDestination(): Destination {
  const m = useModel()
  if (m.screen === 'courses') return 'courses'
  if (m.screen === 'call') return 'awards'
  return m.tab
}

export interface Note {
  id: string
  icon: IconName
  title: string
  body: string
  dest: Destination
  urgent: boolean
}

export function useNotes(): Note[] {
  const m = useModel()
  return useMemo(() => {
    const notes: Note[] = []
    for (const w of m.classes.watches) {
      if (w.status !== 'open') continue
      notes.push({
        id: `seat:${w.term}:${w.crn}:${w.openedAt ?? 0}`,
        icon: 'seat',
        title: `A seat opened in ${courseCode(`${w.subject}${w.courseNumber}`)}, section ${w.sectionNumber}`,
        body: `${w.termDesc}. Register in PAWS before someone else does.`,
        dest: 'classes',
        urgent: true,
      })
    }
    if (m.universityId === 'usask') {
      for (const award of m.rankedAwards) {
        const days = daysUntil(award, m.today)
        if (days === null || days > SOON_DAYS) continue
        notes.push({ id: `award:${award.id}:${days}`, icon: 'clock', title: award.name, body: formatCountdown(days), dest: 'awards', urgent: days <= 7 })
      }
    }
    if (!m.features.ai) {
      notes.push({
        id: 'ai-off',
        icon: 'spark',
        title: 'AI features are off',
        body: 'Transcript reading and the "why you" notes are switched off on this deployment. Search, plans and awards all still work.',
        dest: 'courses',
        urgent: false,
      })
    }
    return notes
  }, [m.classes.watches, m.universityId, m.rankedAwards, m.today, m.features.ai])
}

export type HitGroup = 'Go to' | 'Credentials' | 'Awards' | 'Courses'

export interface Hit {
  id: string
  group: HitGroup
  icon: IconName
  title: string
  meta?: string
  run: () => void
}

/** Finds a DOM node once the page that holds it has rendered, then scrolls to it and flashes it. */
export function focusElement(id: string) {
  let tries = 0
  const seek = () => {
    const el = document.getElementById(id)
    if (el) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' })
      el.classList.remove('is-flash')
      void el.offsetWidth
      el.classList.add('is-flash')
      window.setTimeout(() => el.classList.remove('is-flash'), 1600)
      return
    }
    if (++tries < 60) requestAnimationFrame(seek)
  }
  requestAnimationFrame(seek)
}

export function useSearchHits(query: string): Hit[] {
  const m = useModel()
  const q = query.trim().toLowerCase()
  return useMemo(() => {
    const hits: Hit[] = []
    const destinations = DESTINATIONS.filter((d) => d.id !== 'classes' || m.universityId === 'usask').filter(
      (d) => m.hasProgramData || d.id === 'awards' || d.id === 'courses',
    )
    for (const d of destinations) {
      if (q && !`${d.label} ${d.title} ${d.short}`.toLowerCase().includes(q)) continue
      hits.push({ id: `go:${d.id}`, group: 'Go to', icon: d.icon, title: d.label, run: () => m.navigate(d.id) })
    }
    if (!q) return hits

    const targets = [
      ...m.matches.map((x) => ({ id: x.spec.id, name: x.spec.name, remaining: x.remaining, kind: 'Specialization' })),
      ...m.credentials.map((c) => ({
        id: c.spec.id,
        name: c.program.name,
        remaining: c.remaining,
        kind: c.program.kind === 'minor' ? 'Minor' : 'Certificate',
      })),
    ]
    for (const t of targets.filter((t) => t.name.toLowerCase().includes(q)).slice(0, 5)) {
      hits.push({
        id: `target:${t.id}`,
        group: 'Credentials',
        icon: 'layers',
        title: t.name,
        meta: `${t.kind} · ${t.remaining === 0 ? 'done' : `${t.remaining} left`}`,
        run: () => {
          m.navigate('overview')
          m.openSheet(`target:${t.id}`)
        },
      })
    }

    if (m.universityId === 'usask') {
      for (const award of m.rankedAwards.filter((a) => a.name.toLowerCase().includes(q)).slice(0, 4)) {
        const days = daysUntil(award, m.today)
        hits.push({
          id: `award:${award.id}`,
          group: 'Awards',
          icon: 'award',
          title: award.name,
          meta: days !== null ? formatCountdown(days) : award.deadline,
          run: () => {
            m.navigate('awards')
            focusElement(`award-${award.id}`)
          },
        })
      }
    }

    for (const c of searchCourses(query, 5)) {
      const taken = m.completed.has(c.code)
      hits.push({
        id: `course:${c.code}`,
        group: 'Courses',
        icon: 'browse',
        title: `${courseCode(c.code)} · ${c.title}`,
        meta: taken ? 'In your courses' : 'Add it on Courses',
        run: () => {
          m.setCourseQuery(courseCode(c.code))
          m.navigate('courses')
        },
      })
    }
    return hits
  }, [q, query, m])
}
