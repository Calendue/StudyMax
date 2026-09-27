// Follows a Max call live: what Max proposes arrives as frames the Skill Tree draws step by step, and
// a saved proposal is handed to the app to adopt. Realtime (Supabase Broadcast) when this build has it,
// else — or whenever it drops — polling the snapshot, which is the source of truth either way.
import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../platform.ts'
import type { AppAction, LiveEvent, LiveFrame, LiveInputs, LiveOption, LiveScenario, LiveSnapshot } from '../lib/max/live.ts'
import type { PlannedTerm } from '../lib/plan.ts'
import { openLiveChannel, type LiveChannel } from './realtime.ts'

const POLL_MS = 1500
const HEARTBEAT_MS = 10_000
const FRAME_GAP_MS = 1200
const JOIN_TIMEOUT_MS = 4000
const LINGER_AFTER_END_MS = 60_000
const STORAGE_KEY = 'studymax.maxLive'
const TERMINAL = new Set(['ended', 'failed', 'voicemail', 'no_answer'])

export type Transport = 'realtime' | 'polling'

export interface MaxLive {
  /** A call is being followed (placed, on, or just ended). */
  active: boolean
  callId: string | null
  transport: Transport | null
  callStatus: string | null
  endedReason: string | null
  /** The frame the tree shows instead of the app's own plan; null = the app's own plan. */
  frame: LiveFrame | null
  /** Max's latest proposal (open, saved or left). */
  scenario: LiveScenario | null
  /** Max is working on something (a tool is running). */
  working: boolean
  options: { about: string; options: LiveOption[]; recommended: string | null } | null
  /** Saves still to adopt, or just adopted: "Saved as your plan ✓". */
  savedCount: number
  busy: boolean
  error: string | null
  start(callId: string, token: string): void
  /** Save the open proposal from the app (a spoken yes to Max saves it too). */
  keep(): Promise<void>
  leave(): Promise<void>
  stop(): void
}

interface Options {
  /** The app sets its own state to a saved proposal's inputs (App.tsx adoptMaxPlan). */
  onCommitted: (inputs: LiveInputs, terms: PlannedTerm[]) => void
  /** Max doing something in the app outside the plan (open a tab, look up a class). */
  onAction?: (action: AppAction) => void
  /** The student told Max a new name to go by. */
  onName?: (name: string) => void
}

interface Saved {
  callId: string
  token: string
}

const keyOf = (s: LiveScenario) => `${s.scenarioId}:${s.presentedHash ?? ''}`

function readSaved(): Saved | null {
  try {
    const s = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? 'null') as Saved | null
    return s && typeof s.token === 'string' && typeof s.callId === 'string' ? s : null
  } catch {
    return null
  }
}

function writeSaved(s: Saved | null) {
  try {
    if (s) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(s))
    else sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // storage blocked: a reload just won't rejoin
  }
}

export function useMaxLive({ onCommitted, onAction, onName }: Options): MaxLive {
  const [saved, setSaved] = useState<Saved | null>(readSaved)
  const [transport, setTransport] = useState<Transport | null>(null)
  const [callStatus, setCallStatus] = useState<string | null>(null)
  const [endedReason, setEndedReason] = useState<string | null>(null)
  const [frame, setFrame] = useState<LiveFrame | null>(null)
  const [scenario, setScenario] = useState<LiveScenario | null>(null)
  const [working, setWorking] = useState(false)
  const [options, setOptions] = useState<MaxLive['options']>(null)
  const [savedCount, setSavedCount] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const lastSeq = useRef(0)
  const queue = useRef<LiveFrame[]>([])
  const lastShown = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const adopted = useRef(new Set<string>())
  /** Which proposal the tree already shows, so a catch-up only redraws when Max actually changed it. */
  const shownKey = useRef<string | null>(null)
  const committedRef = useRef(onCommitted)
  committedRef.current = onCommitted
  const actionRef = useRef(onAction)
  actionRef.current = onAction
  const nameRef = useRef(onName)
  nameRef.current = onName

  const clear = useCallback(() => {
    queue.current = []
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    lastSeq.current = 0
    setTransport(null)
    setCallStatus(null)
    setEndedReason(null)
    setFrame(null)
    setScenario(null)
    setWorking(false)
    setOptions(null)
    setError(null)
  }, [])

  /** Shows queued frames at least FRAME_GAP_MS apart, so each change reads before the next. */
  const pump = useCallback(() => {
    if (timer.current || queue.current.length === 0) return
    const wait = Math.max(0, lastShown.current + FRAME_GAP_MS - Date.now())
    timer.current = setTimeout(() => {
      timer.current = null
      const next = queue.current.shift()
      if (next) {
        setFrame(next)
        lastShown.current = Date.now()
      }
      pump()
    }, wait)
  }, [])

  const adopt = useCallback((scenarioId: string, inputs: LiveInputs, terms: PlannedTerm[]) => {
    if (adopted.current.has(scenarioId)) return
    adopted.current.add(scenarioId)
    queue.current = []
    committedRef.current(inputs, terms)
    // The app's own plan is now the saved one, so the tree drops the override without a jump.
    setFrame(null)
    setSavedCount((n) => n + 1)
  }, [])

  const apply = useCallback(
    (event: LiveEvent) => {
      if (event.seq <= lastSeq.current) return
      lastSeq.current = event.seq
      switch (event.type) {
        case 'call.status':
          setCallStatus(event.status)
          if (event.endedReason !== undefined) setEndedReason(event.endedReason ?? null)
          break
        case 'max.working':
          setWorking(true)
          break
        case 'options.presented':
          setWorking(false)
          setOptions({ about: event.about, options: event.options, recommended: event.recommended })
          break
        case 'scenario.presented':
          setWorking(false)
          setScenario(event.scenario)
          shownKey.current = keyOf(event.scenario)
          queue.current.push(...event.scenario.frames)
          pump()
          break
        case 'scenario.committed':
          setScenario((s) => (s && s.scenarioId === event.scenarioId ? { ...s, status: 'committed' } : s))
          adopt(event.scenarioId, event.inputs, event.terms)
          break
        case 'scenario.discarded':
          setScenario((s) => (s && s.scenarioId === event.scenarioId ? { ...s, status: 'discarded' } : s))
          queue.current = []
          setFrame(null)
          break
        case 'app.action':
          setWorking(false)
          actionRef.current?.(event.action)
          break
        case 'profile.name':
          nameRef.current?.(event.name)
          break
      }
    },
    [adopt, pump],
  )

  /** Catches up from the snapshot (and is the heartbeat Max's "it's on your screen" rides on). */
  const catchUp = useCallback(
    async (token: string) => {
      try {
        const res = await fetch(api(`/api/max/live?token=${encodeURIComponent(token)}`), { cache: 'no-store' })
        if (res.status === 404) {
          // The call is long over (or never was): nothing left to follow.
          writeSaved(null)
          setSaved(null)
          clear()
          return
        }
        if (!res.ok) return
        const snap = (await res.json()) as LiveSnapshot
        setCallStatus(snap.call.status)
        setEndedReason(snap.call.endedReason)
        const s = snap.scenario
        if (s) {
          setScenario((prev) => (prev && prev.scenarioId === s.scenarioId && prev.status === s.status ? prev : s))
          if (s.status === 'committed') {
            adopt(s.scenarioId, s.frames[s.frames.length - 1].inputs, s.frames[s.frames.length - 1].terms)
          } else if (s.status === 'presented' && shownKey.current !== keyOf(s) && queue.current.length === 0 && !timer.current) {
            // Missed the event: jump to where Max is (the final frame), no step-by-step replay.
            shownKey.current = keyOf(s)
            setFrame(s.frames[s.frames.length - 1])
          } else if (s.status === 'discarded') {
            setFrame(null)
          }
        } else if (!snap.parity && snap.baseline) {
          // Max's plan differs from the one on screen: show it once, before Max speaks, not mid-change.
          setFrame((f) => f ?? { caption: "Max's view of your plan", terms: snap.baseline!.terms, inputs: snap.baseline!.inputs })
        }
      } catch {
        // offline for a moment: the next tick tries again
      }
    },
    [adopt, clear],
  )

  // Follow the call: Realtime if we can, polling if we can't, re-reading the snapshot throughout.
  useEffect(() => {
    if (!saved) return
    const { token } = saved
    let cancelled = false
    let channel: LiveChannel | null = null
    let poll: ReturnType<typeof setInterval> | null = null
    let joined = false

    const startPolling = () => {
      if (cancelled || poll) return
      setTransport('polling')
      poll = setInterval(() => void catchUp(token), POLL_MS)
    }
    const stopPolling = () => {
      if (poll) clearInterval(poll)
      poll = null
    }

    void catchUp(token)
    const heartbeat = setInterval(() => void catchUp(token), HEARTBEAT_MS)
    const joinTimeout = setTimeout(() => !joined && startPolling(), JOIN_TIMEOUT_MS)
    const onVisible = () => document.visibilityState === 'visible' && void catchUp(token)
    document.addEventListener('visibilitychange', onVisible)

    void openLiveChannel(token, apply, (state) => {
      if (cancelled) return
      if (state === 'subscribed') {
        joined = true
        stopPolling()
        setTransport('realtime')
        void catchUp(token)
      } else {
        startPolling()
      }
    }).then((ch) => {
      if (cancelled) ch?.close()
      else if (!ch) startPolling()
      else channel = ch
    })

    return () => {
      cancelled = true
      stopPolling()
      clearInterval(heartbeat)
      clearTimeout(joinTimeout)
      document.removeEventListener('visibilitychange', onVisible)
      channel?.close()
    }
  }, [saved, apply, catchUp])

  // After the call ends with nothing left open, stop following it (the end state lingers a minute).
  useEffect(() => {
    if (!saved || !callStatus || !TERMINAL.has(callStatus) || scenario?.status === 'presented') return
    const t = setTimeout(() => {
      writeSaved(null)
      setSaved(null)
      clear()
    }, LINGER_AFTER_END_MS)
    return () => clearTimeout(t)
  }, [saved, callStatus, scenario?.status, clear])

  const start = useCallback(
    (callId: string, token: string) => {
      clear()
      adopted.current = new Set()
      setSavedCount(0)
      const next = { callId, token }
      writeSaved(next)
      setSaved(next)
    },
    [clear],
  )

  const stop = useCallback(() => {
    writeSaved(null)
    setSaved(null)
    clear()
  }, [clear])

  const post = useCallback(
    async (action: 'commit' | 'discard') => {
      if (!saved || !scenario || scenario.status !== 'presented') return
      setBusy(true)
      setError(null)
      try {
        const res = await fetch(api('/api/max/live'), {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action, token: saved.token, scenarioId: scenario.scenarioId, presentedHash: scenario.presentedHash }),
        })
        const data = (await res.json().catch(() => ({}))) as { error?: string; inputs?: LiveInputs; terms?: PlannedTerm[] }
        if (!res.ok) {
          // Max changed the proposal as you tapped: show the newest and let them decide on that.
          setError(data.error === 'STALE_PRESENTATION' ? 'Max just changed this — have a look at the new version.' : "That didn't go through — try again.")
          void catchUp(saved.token)
          return
        }
        if (action === 'commit' && data.inputs && data.terms) {
          setScenario((s) => (s ? { ...s, status: 'committed' } : s))
          adopt(scenario.scenarioId, data.inputs, data.terms)
        } else if (action === 'discard') {
          setScenario((s) => (s ? { ...s, status: 'discarded' } : s))
          queue.current = []
          setFrame(null)
        }
      } catch {
        setError("That didn't go through — try again.")
      } finally {
        setBusy(false)
      }
    },
    [saved, scenario, adopt, catchUp],
  )

  return {
    active: saved !== null,
    callId: saved?.callId ?? null,
    transport,
    callStatus,
    endedReason,
    frame,
    scenario,
    working,
    options,
    savedCount,
    busy,
    error,
    start,
    keep: () => post('commit'),
    leave: () => post('discard'),
    stop,
  }
}
