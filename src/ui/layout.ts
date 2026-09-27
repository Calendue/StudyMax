import { useSyncExternalStore } from 'react'
import type { IconName } from './Icon.tsx'

/**
 * Adaptive navigation by width, as CalenDue's shell does it: bottom `tabs` on compact widths, a `rail`
 * of icons and short labels on regular widths, and the full `sidebar` dashboard on wide ones. Native
 * iPads and large Android screens take the same breakpoints.
 */
export type LayoutMode = 'tabs' | 'rail' | 'sidebar'

const RAIL_QUERY = '(min-width: 768px)'
const SIDEBAR_QUERY = '(min-width: 1200px)'

function read(): LayoutMode {
  if (typeof window === 'undefined') return 'tabs'
  if (window.matchMedia(SIDEBAR_QUERY).matches) return 'sidebar'
  if (window.matchMedia(RAIL_QUERY).matches) return 'rail'
  return 'tabs'
}

function subscribe(onChange: () => void) {
  const queries = [window.matchMedia(RAIL_QUERY), window.matchMedia(SIDEBAR_QUERY)]
  queries.forEach((q) => q.addEventListener('change', onChange))
  return () => queries.forEach((q) => q.removeEventListener('change', onChange))
}

export function useLayoutMode(): LayoutMode {
  return useSyncExternalStore(subscribe, read, () => 'tabs')
}

/** Where the navigation can take you once there are results: the four tabs and the courses. */
export type Destination = 'overview' | 'plan' | 'awards' | 'classes' | 'courses'

export interface DestinationInfo {
  id: Destination
  /** The sidebar's full name. */
  label: string
  /** The tab bar's and the rail's short name. */
  short: string
  /** The desktop header's page title. */
  title: string
  icon: IconName
}

export const DESTINATIONS: DestinationInfo[] = [
  { id: 'overview', label: 'Dashboard', short: 'Closest', title: 'Dashboard', icon: 'target' },
  { id: 'plan', label: 'Plan', short: 'Plan', title: 'Your plan', icon: 'plan' },
  { id: 'classes', label: 'Class Tracker', short: 'Tracker', title: 'Class Tracker', icon: 'seat' },
  { id: 'courses', label: 'Courses', short: 'Courses', title: 'Your courses', icon: 'browse' },
  { id: 'awards', label: 'Awards', short: 'Awards', title: 'Awards', icon: 'award' },
]

export function destinationInfo(id: Destination): DestinationInfo {
  return DESTINATIONS.find((d) => d.id === id) ?? DESTINATIONS[0]
}
