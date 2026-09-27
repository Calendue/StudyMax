import { useSyncExternalStore } from 'react'

// The student's picks for the plan's elective slots ('elective:<n>:<label>' → 'PSY120'), shared by
// the roadmap and the course detail. Device-only, like the roadmap's hidden electives: it never
// reaches the planner, so the plan's terms and totals are the same with or without it.

const KEY = 'studymax:elective-picks'
const listeners = new Set<() => void>()
let picks: Record<string, string> = read()

function read(): Record<string, string> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    return value && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).filter((e): e is [string, string] => typeof e[1] === 'string'))
      : {}
  } catch {
    return {}
  }
}

function write(next: Record<string, string>) {
  picks = next
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // Private mode or blocked storage: the pick holds until the page reloads.
  }
  listeners.forEach((l) => l())
}

export function pickElective(slot: string, code: string) {
  write({ ...picks, [slot]: code })
}

export function clearElective(slot: string) {
  const { [slot]: _, ...rest } = picks
  write(rest)
}

export function useElectivePicks(): Record<string, string> {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => picks,
  )
}
