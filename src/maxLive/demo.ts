// A scripted Max call for rehearsing and demoing the live tree without a phone call: `?maxdemo=1`
// (or any dev build) plays it through the SAME event handler a real call's Realtime/polling feeds
// (useMaxLive `apply`). It only ever builds frames from a copy of the plan on screen; nothing is sent
// to the server and nothing is saved. Pure (no React).
import { isElective, type PlannedTerm } from '../lib/plan.ts'
import { courseCode } from '../format.ts'
import type { LiveEvent, LiveFrame, LiveInputs, LiveScenario } from '../lib/max/live.ts'

const ADD_CANDIDATES = ['CMPT423', 'CMPT412', 'CMPT414', 'CMPT434', 'CMPT420', 'CMPT481']

/** On in dev builds, or when the page was opened with ?maxdemo (remembered for the tab). */
export function maxDemoEnabled(): boolean {
  if (import.meta.env.DEV) return true
  try {
    if (new URLSearchParams(location.search).has('maxdemo')) sessionStorage.setItem('studymax.maxdemo', '1')
    return sessionStorage.getItem('studymax.maxdemo') === '1'
  } catch {
    return false
  }
}

/** ?maxdemo=1 in the address: play the sequence once the Plan opens. */
export function maxDemoAutoplay(): boolean {
  try {
    return new URLSearchParams(location.search).get('maxdemo') === '1'
  } catch {
    return false
  }
}

const clone = (terms: PlannedTerm[]) => terms.map((t) => ({ ...t, courses: t.courses.map((c) => ({ ...c })) }))
const real = (code: string) => !isElective(code)

/**
 * Three frames on top of `terms`: drop a planned course, add one in a later term, move one a term
 * earlier. Returns null when the plan is too short to show them.
 */
export function demoFrames(terms: PlannedTerm[], base: LiveInputs, taken: Set<string>): LiveFrame[] | null {
  const reals = (t: PlannedTerm) => t.courses.filter((c) => c.reason !== 'registered' && real(c.code))
  const withReal = terms.map((t, i) => ({ n: reals(t).length, i })).filter((x) => x.n > 0)
  if (terms.length < 2 || withReal.length === 0) return null
  const frames: LiveFrame[] = []
  const inputs = { ...base, droppedCourses: [...base.droppedCourses] }
  const lastReal = withReal.at(-1)!.i

  // 1. Drop: a planned course, from a term that keeps another one to move afterwards.
  let cur = clone(terms)
  const dropFrom = (withReal.find((x) => x.i !== lastReal) ?? withReal.find((x) => x.n > 1) ?? withReal[0]).i
  const dropped = reals(cur[dropFrom]).at(-1)!
  cur[dropFrom].courses = cur[dropFrom].courses.filter((c) => c.code !== dropped.code)
  inputs.droppedCourses.push(dropped.code)
  frames.push({ caption: `Max dropped ${courseCode(dropped.code)}`, terms: cur, inputs: { ...inputs } })

  // 2. Add: a senior course in the last term, next to what's already there.
  cur = clone(cur)
  const onPlan = new Set(cur.flatMap((t) => t.courses.map((c) => c.code)))
  const code = ADD_CANDIDATES.find((c) => !onPlan.has(c) && !taken.has(c) && c !== dropped.code)
  const late = terms.length - 1
  if (code) {
    const like = reals(cur[late])[0] ?? cur[late].courses[0] ?? dropped
    cur[late].courses = [...cur[late].courses, { ...like, code, reason: 'requirement' }]
    frames.push({ caption: `Max added ${courseCode(code)} in ${cur[late].label}`, terms: cur, inputs: { ...inputs, added: [...(inputs.added ?? []), code] } })
  }

  // 3. Move: a course a term earlier (or later, when it's already in the first term).
  cur = clone(cur)
  const from = Math.max(...cur.map((t, i) => (reals(t).length > 0 ? i : -1)))
  const to = from > 0 ? from - 1 : 1
  // Rather one Max didn't just add; on a short plan, the one he added moves up a term.
  const mover = reals(cur[from]).find((c) => c.code !== code) ?? reals(cur[from])[0]
  if (mover && to < cur.length) {
    cur[from].courses = cur[from].courses.filter((c) => c.code !== mover.code)
    cur[to].courses = [...cur[to].courses, mover]
    frames.push({ caption: `Max moved ${courseCode(mover.code)} to ${cur[to].label}`, terms: cur, inputs: { ...inputs } })
  }
  return frames
}

/** The events a real call would deliver, including a duplicate and an out-of-order one. */
export function demoEvents(frames: LiveFrame[], gradBefore: string | null): LiveEvent[] {
  const scenario = (id: string, fs: LiveFrame[]): LiveScenario => ({
    scenarioId: id,
    status: 'presented',
    presentedHash: id,
    requiresAppConfirmation: false,
    headline: fs.map((f) => f.caption),
    errors: [],
    graduation: { before: gradBefore, after: gradBefore },
    frames: fs,
  })
  const first = { type: 'scenario.presented', seq: 3, scenario: scenario('demo-1', frames.slice(0, 1)) } as const
  const events: LiveEvent[] = [
    { type: 'call.status', seq: 1, status: 'in_progress' },
    { type: 'max.working', seq: 2, tool: 'drop' },
    first,
    // Realtime and polling both deliver the same change: it must not replay.
    first,
  ]
  if (frames.length > 1) events.push({ type: 'scenario.presented', seq: 5, scenario: scenario('demo-2', frames.slice(0, 2)) })
  // An older change arriving late: it must never animate the tree backwards.
  events.push({ type: 'scenario.presented', seq: 4, scenario: scenario('demo-old', frames.slice(0, 1)) })
  if (frames.length > 2) events.push({ type: 'scenario.presented', seq: 6, scenario: scenario('demo-3', frames) })
  return events
}
