import { useCallback, useEffect, useRef, useState } from 'react'
import { api, haptic } from './platform.ts'
import { applyReading, defaultTerm, MAX_WATCHES, watchFrom, type SeatState, type Section, type Term, type Watch } from './lib/classTracker.ts'

// The class tracker's state: USask terms, one course's sections at a time, and the sections being
// watched. Watches live on this device and are re-checked about once a minute while the app is open
// and visible, from wherever the student is in the results, so an opening is heard on any tab.

const STORAGE_KEY = 'studymax:class-watches'
const POLL_MS = 60_000

export type Load<T> = { state: 'idle' } | { state: 'loading' } | { state: 'error'; message: string } | { state: 'done'; value: T }

function loadWatches(): Watch[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(api(path), { cache: 'no-store' })
  if (!res.ok) throw new Error(res.status === 404 ? 'not deployed' : `HTTP ${res.status}`)
  return (await res.json()) as T
}

const UNREACHABLE = "Couldn't reach USask's class search. Try again in a moment."

export function useClassTracker() {
  const [terms, setTerms] = useState<Load<Term[]>>({ state: 'idle' })
  const [term, setTerm] = useState('')
  const [course, setCourse] = useState('')
  const [sections, setSections] = useState<Load<Section[]>>({ state: 'idle' })
  const [watches, setWatches] = useState<Watch[]>(loadWatches)
  /** The most recent opening, until the student has seen it. */
  const [alert, setAlert] = useState<Watch | null>(null)
  const [checking, setChecking] = useState(false)
  const searchId = useRef(0)
  /** Which open terms run the course being typed: section count per term, null where the check failed. */
  const [offered, setOffered] = useState<{ course: string; byTerm: Load<Record<string, number | null>> } | null>(null)
  const offeredId = useRef(0)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(watches))
    } catch {
      // storage blocked: the watches still work for this session
    }
  }, [watches])

  const loadTerms = useCallback(async () => {
    setTerms({ state: 'loading' })
    try {
      const { terms: list } = await getJson<{ terms: Term[] }>('/api/classes?op=terms')
      setTerms({ state: 'done', value: list })
      setTerm((current) => current || defaultTerm(list)?.code || '')
    } catch {
      setTerms({ state: 'error', message: UNREACHABLE })
    }
  }, [])

  /** Terms are fetched the first time the tracker is opened, not at launch. */
  const ensureTerms = useCallback(() => {
    if (terms.state === 'idle') void loadTerms()
  }, [terms.state, loadTerms])

  async function search(code: string, inTerm = term) {
    const clean = code.trim().toUpperCase()
    if (!clean || !inTerm) return
    const id = ++searchId.current
    setTerm(inTerm)
    setCourse(clean)
    setSections({ state: 'loading' })
    try {
      const { sections: list } = await getJson<{ sections: Section[] }>(
        `/api/classes?op=search&term=${inTerm}&course=${encodeURIComponent(clean)}`,
      )
      if (id === searchId.current) setSections({ state: 'done', value: list })
    } catch {
      if (id === searchId.current) setSections({ state: 'error', message: UNREACHABLE })
    }
  }

  /** Looks the course up across every open term, so each term can say whether it runs it. */
  const checkOffered = useCallback(
    async (code: string) => {
      const clean = code.trim().toUpperCase().replace(/\s+/g, '')
      const open = terms.state === 'done' ? terms.value.filter((t) => !t.viewOnly).map((t) => t.code) : []
      const id = ++offeredId.current
      if (!clean || open.length === 0) {
        setOffered(null)
        return
      }
      setOffered({ course: clean, byTerm: { state: 'loading' } })
      try {
        const { offered: byTerm } = await getJson<{ offered: Record<string, number | null> }>(
          `/api/classes?op=offered&terms=${open.join(',')}&course=${encodeURIComponent(clean)}`,
        )
        if (id === offeredId.current) setOffered({ course: clean, byTerm: { state: 'done', value: byTerm } })
      } catch {
        if (id === offeredId.current) setOffered({ course: clean, byTerm: { state: 'error', message: UNREACHABLE } })
      }
    },
    [terms],
  )

  const clearOffered = useCallback(() => {
    offeredId.current++
    setOffered(null)
  }, [])

  function chooseTerm(code: string) {
    haptic.selection()
    setTerm(code)
    if (course) void search(course, code)
  }

  function watch(section: Section) {
    haptic.light()
    setWatches((list) =>
      list.some((w) => w.crn === section.crn && w.term === section.term)
        ? list
        : [watchFrom(section, Date.now()), ...list].slice(0, MAX_WATCHES),
    )
  }

  function unwatch(crn: string, inTerm: string) {
    haptic.selection()
    setWatches((list) => list.filter((w) => !(w.crn === crn && w.term === inTerm)))
    setAlert((a) => (a?.crn === crn && a.term === inTerm ? null : a))
  }

  const isWatching = (section: Section) => watches.some((w) => w.crn === section.crn && w.term === section.term)

  const watchesRef = useRef(watches)
  watchesRef.current = watches

  // The poll, the tab coming back into view and the Check button can all fire together; one check at
  // a time is enough, and overlapping ones would race each other's results.
  const inFlight = useRef(false)

  const checkNow = useCallback(async () => {
    const list = watchesRef.current
    if (list.length === 0 || inFlight.current) return
    inFlight.current = true
    setChecking(true)
    const startedAt = Date.now()
    const byTerm = new Map<string, Watch[]>()
    for (const w of list) byTerm.set(w.term, [...(byTerm.get(w.term) ?? []), w])
    const readings = new Map<string, SeatState>()
    try {
      await Promise.all(
        [...byTerm].map(async ([t, ws]) => {
          const courses = [...new Set(ws.map((w) => `${w.subject}${w.courseNumber}`))].join(',')
          try {
            const data = await getJson<{ seats: { crn: string; seats: SeatState }[] }>(
              `/api/classes?op=seats&term=${t}&courses=${encodeURIComponent(courses)}`,
            )
            for (const r of data.seats) readings.set(`${t}:${r.crn}`, r.seats)
          } catch {
            // keep the last readings; the next tick tries again
          }
        }),
      )
    } finally {
      inFlight.current = false
      setChecking(false)
    }
    // Folded into the watches as they are NOW: one added, removed or (in the demo) opened while the
    // check was out keeps that newer state instead of being overwritten by a stale reading.
    const now = Date.now()
    let opened: Watch | null = null
    const updated = new Map<string, Watch>()
    for (const w of watchesRef.current) {
      const live = readings.get(`${w.term}:${w.crn}`)
      if (!live || w.checkedAt > startedAt) continue
      const result = applyReading(w, live, now)
      if (result.opened) opened = result.next
      updated.set(`${w.term}:${w.crn}`, result.next)
    }
    setWatches((current) =>
      current.map((w) => (w.checkedAt > startedAt ? w : (updated.get(`${w.term}:${w.crn}`) ?? w))),
    )
    if (opened) {
      haptic.medium()
      setAlert(opened)
    }
  }, [])

  // Re-check about once a minute while there's something to watch and the app is on screen.
  const hasWatches = watches.length > 0
  useEffect(() => {
    if (!hasWatches) return
    const tick = () => {
      if (document.visibilityState === 'visible') void checkNow()
    }
    tick()
    const id = window.setInterval(tick, POLL_MS)
    document.addEventListener('visibilitychange', tick)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [hasWatches, checkNow])

  /**
   * Demo only: plays a watched section's next reading as an opening, so the payoff can be shown on
   * stage without waiting for a real student to drop the class.
   */
  function simulateOpening(crn: string, inTerm: string) {
    const now = Date.now()
    const target = watchesRef.current.find((w) => w.crn === crn && w.term === inTerm)
    if (!target) return
    const opened: Watch = { ...target, status: 'open', seats: Math.max(1, target.seats), checkedAt: now, openedAt: now }
    // The ref moves with the state, so a check already in flight sees the opening and leaves it be.
    const next = watchesRef.current.map((w) => (w.crn === crn && w.term === inTerm ? opened : w))
    watchesRef.current = next
    setWatches(next)
    haptic.medium()
    setAlert(opened)
  }

  return {
    terms,
    loadTerms,
    ensureTerms,
    term,
    chooseTerm,
    course,
    sections,
    search,
    offered,
    checkOffered,
    clearOffered,
    watches,
    watch,
    unwatch,
    isWatching,
    checking,
    checkNow,
    alert,
    dismissAlert: () => setAlert(null),
    simulateOpening,
  }
}

export type ClassTracker = ReturnType<typeof useClassTracker>
