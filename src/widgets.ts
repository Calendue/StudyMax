import { registerPlugin } from '@capacitor/core'
import { isNative } from './platform.ts'
import type { WidgetDeadline, WidgetSnapshot } from './lib/widgetSnapshot.ts'

// The bridge to the home-screen widgets and the deadline watch (a Live Activity / Dynamic Island on
// iOS, a Live Update on Android). One local plugin on each platform, same name, same methods:
// ios/App/App/StudyMaxWidgetsPlugin.swift and android/.../StudyMaxWidgetsPlugin. The web has no
// widgets, so every call is a no-op there.

export type WatchFailure = 'unsupported' | 'denied' | 'disabled' | 'error'

interface StudyMaxWidgetsPlugin {
  /** Stores the snapshot where the widgets read it, and refreshes them. */
  save(options: { snapshot: string }): Promise<void>
  /** Removes it (widgets fall back to their empty state) and ends any deadline watch. */
  clear(): Promise<void>
  startDeadlineWatch(options: WidgetDeadline): Promise<{ started: boolean; reason?: WatchFailure }>
  stopDeadlineWatch(): Promise<void>
  getDeadlineWatch(): Promise<{ active: boolean; id: string | null }>
}

const Native = registerPlugin<StudyMaxWidgetsPlugin>('StudyMaxWidgets')

// What was last written, minus the timestamp, so a re-render with the same content writes nothing.
// `undefined` until the first sync: the first one always goes through, which also clears a snapshot
// left behind by a session that has since been reset.
let lastWritten: string | null | undefined

export function syncWidgets(snapshot: WidgetSnapshot | null) {
  if (!isNative) return
  const key = snapshot ? JSON.stringify({ ...snapshot, updatedAt: '' }) : null
  if (key === lastWritten) return
  lastWritten = key
  // A failure leaves the widgets showing the last snapshot, which is the right fallback.
  void (snapshot ? Native.save({ snapshot: JSON.stringify(snapshot) }) : Native.clear()).catch(() => {})
}

export async function startDeadlineWatch(deadline: WidgetDeadline): Promise<{ started: boolean; reason?: WatchFailure }> {
  if (!isNative) return { started: false, reason: 'unsupported' }
  try {
    return await Native.startDeadlineWatch(deadline)
  } catch {
    return { started: false, reason: 'error' }
  }
}

export async function stopDeadlineWatch() {
  if (!isNative) return
  await Native.stopDeadlineWatch().catch(() => {})
}

/** The id of the award being watched, or null. Asked on launch: the watch outlives the app. */
export async function currentDeadlineWatch(): Promise<string | null> {
  if (!isNative) return null
  try {
    const { active, id } = await Native.getDeadlineWatch()
    return active ? id : null
  } catch {
    return null
  }
}

/** One plain sentence for each way starting a watch can fail. */
export function watchFailureMessage(reason: WatchFailure | undefined): string {
  switch (reason) {
    case 'denied':
      return 'StudyMax needs notification permission to keep the countdown on your screen. You can allow it in Settings.'
    case 'disabled':
      return 'Live Activities are switched off for StudyMax. You can turn them on in Settings.'
    case 'unsupported':
      return "This phone's system is too old for a live countdown. The widgets still show it."
    default:
      return "The countdown didn't start. Try again in a moment."
  }
}
