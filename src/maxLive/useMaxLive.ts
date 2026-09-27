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
/** One change at a time: the camera moves, the card animates, then the next (useTreeTransition). */
const FRAME_GAP_MS = 1500
/** Catching up after a reconnect: the missed changes play quickly, still one by one. */
const CATCHUP_GAP_MS = 650
const JOIN_TIMEOUT_MS = 4000
const LINGER_AFTER_END_MS = 60_000
const STORAGE_KEY = 'studymax.maxLive'
/** Saves this device already took on, so a reopen never re-applies one over later changes. */
const ADOPTED_KEY = 'studymax.maxLive.adopted'
const ADOPTED_KEEP = 50
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
  /** The last seat check Max ran on this call, for a small tag ("CMPT 370 · Full"). */
  seats: Omit<Extract<LiveEvent, { type: 'seats.checked' }>, 'type' | 'seq'> | null
  /** Saves still to adopt, or just adopted: "Saved as your plan ✓". */
  savedCount: number
  busy: boolean
  error: string | null
  /** What Max changed on screen this call, in the order it played. */
  log: string[]
  /** The scripted rehearsal call (demo.ts) is playing: nothing reaches the server. */
  demo: boolean
  /** Plays a scripted call's events through the same handler a real call uses. */
  runDemo(events: LiveEvent[]): void
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
  /** The student told Max when a course is: the app sets that course's term (App.tsx). */
  onCourseTerm?: (courseCode: string, term: string) => void
  /** False until the app's own saved session is loaded; nothing is followed (or adopted) before then. */
  ready?: boolean
}

interface Saved {
  callId: string
  token: string
}

const keyOf = (s: LiveScenario) => `${s.scenarioId}:${s.presentedHash ?? ''}`
/** A frame's identity: the same plan with the same words is the same change, whichever path brought it. */
const frameKey = (f: LiveFrame) => `${f.caption}|${f.terms.map((t) => `${t.label}:${t.courses.map((c) => c.code).join(',')}`).join('|')}`

// localStorage, not sessionStorage: the call being followed survives closing the browser, so a change
// Max saved while the app was closed (the student on the phone, app shut) is picked up on reopen.
function readSaved(): Saved | null {
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Saved | null
    return s && typeof s.token === 'string' && typeof s.callId === 'string' ? s : null
  } catch {
    return null
  }
}

function writeSaved(s: Saved | null) {
  try {
    if (s) localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // storage blocked: a reopen just won't rejoin
  }
}

function readAdopted(): Set<string> {
  try {
    const ids = JSON.parse(localStorage.getItem(ADOPTED_KEY) ?? '[]') as unknown
    return new Set(Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string') : [])
  } catch {
    return new Set()
  }
}

function writeAdopted(ids: Set<string>) {
  try {
    localStorage.setItem(ADOPTED_KEY, JSON.stringify([...ids].slice(-ADOPTED_KEEP)))
  } catch {
    // storage blocked: at worst a reopen re-applies the same save
  }
}

export function useMaxLive({ onCommitted, onAction, onName, onCourseTerm, ready = true }: Options): MaxLive {
  const [saved, setSaved] = useState<Saved | null>(readSaved)
  const [transport, setTransport] = useState<Transport | null>(null)
  const [callStatus, setCallStatus] = useState<string | null>(null)
  const [endedReason, setEndedReason] = useState<string | null>(null)
  const [frame, setFrame] = useState<LiveFrame | null>(null)
  const [scenario, setScenario] = useState<LiveScenario | null>(null)
  const [working, setWorking] = useState(false)
  const [options, setOptions] = useState<MaxLive['options']>(null)
  const [seats, setSeats] = useState<MaxLive['seats']>(null)
  const [savedCount, setSavedCount] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [demo, setDemo] = useState(false)
  const [log, setLog] = useState<string[]>([])
  const demoTimers = useRef<ReturnType<typeof setTimeout>[]>([])

  const lastSeq = useRef(0)
  const queue = useRef<{ frame: LiveFrame; gap: number }[]>([])
  /** The last frame shown or queued, so a scenario re-sent with its earlier frames only adds what's new. */
  const lastFrame = useRef<string | null>(null)
  /** The newest snapshot read: an older one arriving late never moves the tree backwards. */
  const snapSeq = useRef(0)
  const lastShown = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const adopted = useRef(readAdopted())
  /** Which proposal the tree already shows, so a catch-up only redraws when Max actually changed it. */
  const shownKey = useRef<string | null>(null)
  const committedRef = useRef(onCommitted)
  committedRef.current = onCommitted
  const actionRef = useRef(onAction)
  actionRef.current = onAction
  const nameRef = useRef(onName)
  nameRef.current = onName
  const termRef = useRef(onCourseTerm)
  termRef.current = onCourseTerm

  const clear = useCallback(() => {
    queue.current = []
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    lastSeq.current = 0
    lastFrame.current = null
    snapSeq.current = 0
    demoTimers.current.forEach(clearTimeout)
    demoTimers.current = []
    setDemo(false)
    setLog([])
    setTransport(null)
    setCallStatus(null)
    setEndedReason(null)
    setFrame(null)
    setScenario(null)
    setWorking(false)
    setOptions(null)
    setSeats(null)
    setError(null)
  }, [])

  /** Shows queued frames at least FRAME_GAP_MS apart, so each change reads before the next. */
  const pump = useCallback(() => {
    if (timer.current || queue.current.length === 0) return
    const wait = Math.max(0, lastShown.current + queue.current[0].gap - Date.now())
    timer.current = setTimeout(() => {
      timer.current = null
      const next = queue.current.shift()
      if (next) {
        setFrame(next.frame)
        setLog((l) => [...l, next.frame.caption])
        lastShown.current = Date.now()
      }
      pump()
    }, wait)
  }, [])

  /** Queues the frames after the last one shown (all of them if it isn't among them). */
  const enqueue = useCallback(
    (frames: LiveFrame[], gap: number) => {
      const keys = frames.map(frameKey)
      const from = lastFrame.current ? keys.lastIndexOf(lastFrame.current) + 1 : 0
      const fresh = frames.slice(from)
      if (fresh.length === 0) return
      lastFrame.current = keys[keys.length - 1]
      queue.current.push(...fresh.map((frame) => ({ frame, gap })))
      pump()
    },
    [pump],
  )

  const adopt = useCallback((scenarioId: string, inputs: LiveInputs, terms: PlannedTerm[]) => {
    if (adopted.current.has(scenarioId)) return
    adopted.current.add(scenarioId)
    writeAdopted(adopted.current)
    queue.current = []
    lastFrame.current = null
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
          enqueue(event.scenario.frames, FRAME_GAP_MS)
          break
        case 'scenario.committed':
          setScenario((s) => (s && s.scenarioId === event.scenarioId ? { ...s, status: 'committed' } : s))
          adopt(event.scenarioId, event.inputs, event.terms)
          break
        case 'scenario.discarded':
          setScenario((s) => (s && s.scenarioId === event.scenarioId ? { ...s, status: 'discarded' } : s))
          queue.current = []
          lastFrame.current = null
          setFrame(null)
          break
        case 'app.action':
          setWorking(false)
          actionRef.current?.(event.action)
          break
        case 'profile.name':
          nameRef.current?.(event.name)
          break
        case 'course.term':
          termRef.current?.(event.courseCode, event.term)
          break
        case 'seats.checked':
          setWorking(false)
          setSeats({ courseCode: event.courseCode, term: event.term, status: event.status, seatsOpen: event.seatsOpen })
          break
      }
    },
    [adopt, enqueue],
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
        if (snap.seq < snapSeq.current) return
        snapSeq.current = snap.seq
        setCallStatus(snap.call.status)
        setEndedReason(snap.call.endedReason)
        // The call's last save, even if a newer proposal is on top: take it on if this device hasn't.
        const saved = snap.committed
        if (saved && saved.frames.length > 0) {
          const last = saved.frames[saved.frames.length - 1]
          adopt(saved.scenarioId, last.inputs, last.terms)
        }
        const s = snap.scenario
        if (s) {
          setScenario((prev) => (prev && prev.scenarioId === s.scenarioId && prev.status === s.status ? prev : s))
          if (s.status === 'committed') {
            adopt(s.scenarioId, s.frames[s.frames.length - 1].inputs, s.frames[s.frames.length - 1].terms)
          } else if (s.status === 'presented' && shownKey.current !== keyOf(s)) {
            // Missed the event (a reconnect): play what we missed, quickly and in order.
            shownKey.current = keyOf(s)
            enqueue(s.frames, CATCHUP_GAP_MS)
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
    [adopt, clear, enqueue],
  )

  // Follow the call: Realtime if we can, polling if we can't, re-reading the snapshot throughout.
  useEffect(() => {
    if (!saved || !ready) return
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
  }, [saved, ready, apply, catchUp])

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
          lastFrame.current = null
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

  const runDemo = useCallback(
    (events: LiveEvent[]) => {
      clear()
      setDemo(true)
      // A change every ~1.1 s: faster than the tree plays them, so later ones queue mid-animation.
      demoTimers.current = events.map((e, i) => setTimeout(() => apply(e), i === 0 ? 0 : 400 + i * 1100))
      const end = 400 + events.length * 1100 + FRAME_GAP_MS * 2
      demoTimers.current.push(setTimeout(() => apply({ type: 'call.status', seq: 1000, status: 'ended', endedReason: null }), end))
    },
    [clear, apply],
  )

  return {
    active: saved !== null || demo,
    demo,
    log,
    runDemo,
    callId: saved?.callId ?? null,
    transport,
    callStatus,
    endedReason,
    frame,
    scenario,
    working,
    options,
    seats,
    savedCount,
    busy,
    error,
    start,
    keep: () => post('commit'),
    leave: () => post('discard'),
    stop,
  }
}
