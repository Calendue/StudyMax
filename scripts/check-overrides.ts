// Asserts applyOverrides (src/lib/overrides.ts) on the sample student: failing an in-progress course
// un-books what needs it, failing a completed one un-books its in-progress dependants, withdrew is the
// same as never having taken it, not-offered blocks, invalid ones are dropped, and shuffled input
// gives the same answer. Run:
//   node --experimental-strip-types --experimental-loader ./scripts/_resolve-ts-loader.mjs scripts/check-overrides.ts
import { applyOverrides, sortOverrides, overrideLabel, type CourseOverride, type OverrideInput } from '../src/lib/overrides.ts'
import { defaultCatalog } from '../src/lib/catalog.ts'
import { completedCourses, inProgressCourses, inProgressTerms } from '../src/data/transcript.ts'

const catalog = defaultCatalog()
const CURRENT = 'Fall 2026'
const label = (s: string) => (s === 'Fall' ? 'Fall 2026' : s === 'Winter' ? 'Winter 2027' : 'Spring/Summer 2027')
const booked: Record<string, string[]> = {}
for (const code of inProgressCourses) (booked[label(inProgressTerms[code] ?? 'Fall')] ??= []).push(code)
const sample: OverrideInput = { completed: new Set(completedCourses), inProgress: inProgressCourses, booked }

let failures = 0
function assert(ok: boolean, what: string) {
  if (!ok) {
    failures++
    console.log(`FAIL ${what}`)
  } else console.log(`ok   ${what}`)
}
const run = (os: CourseOverride[], input = sample) => applyOverrides(input, os, catalog, CURRENT)
const isBooked = (r: ReturnType<typeof run>, code: string) => Object.values(r.booked).some((cs) => cs.includes(code))

// 1. Fail in-progress CMPT 332 (Fall 2026): CMPT 434 (Winter 2027, needs CMPT 332) is un-booked.
{
  const r = run([{ code: 'CMPT332', term: 'Fall 2026', kind: 'failed' }])
  assert(!r.inProgress.includes('CMPT332') && !isBooked(r, 'CMPT332'), 'failed CMPT332 leaves in progress and booked')
  assert(!r.inProgress.includes('CMPT434') && !isBooked(r, 'CMPT434'), 'failed CMPT332 un-books CMPT434')
  assert(r.retakes.includes('CMPT332'), 'failed CMPT332 is a retake')
  const note = r.notes.find((n) => n.code === 'UNBOOKED' && n.course === 'CMPT434')
  assert(note?.message === "You're registered for CMPT 434 in Winter 2027 but it needs CMPT 332; the plan moves it. Check with the department.", `UNBOOKED note copy: ${note?.message}`)
  assert(r.inProgress.includes('CMPT340') && r.inProgress.includes('CMPT353'), 'unrelated Winter courses stay')
}

// 2. Fail completed CMPT 280: its in-progress dependants (332, 353, 360, 370) are un-booked, transitively 434.
{
  const r = run([{ code: 'CMPT280', term: 'Winter 2026', kind: 'failed' }])
  assert(!r.completed.has('CMPT280'), 'failed CMPT280 leaves completed')
  for (const c of ['CMPT332', 'CMPT353', 'CMPT360', 'CMPT370', 'CMPT434'])
    assert(!r.inProgress.includes(c) && !isBooked(r, c), `failed CMPT280 un-books ${c}`)
  assert(r.inProgress.includes('MATH266'), 'MATH266 (no CMPT280 prerequisite) stays')
}

// 3. Withdrew equals never taken.
{
  const r = run([{ code: 'CMPT332', term: 'Fall 2026', kind: 'withdrew' }])
  const never = run([], { ...sample, inProgress: inProgressCourses.filter((c) => c !== 'CMPT332'), booked: { ...booked, 'Fall 2026': booked['Fall 2026'].filter((c) => c !== 'CMPT332') } })
  // Never-taken still has CMPT434 booked (nothing removed triggers no cascade), so compare the course itself.
  assert(!r.inProgress.includes('CMPT332') && !never.inProgress.includes('CMPT332'), 'withdrew CMPT332 == not in progress')
  assert(r.notes.some((n) => n.code === 'RETAKE' && n.message.startsWith('You withdrew from CMPT 332')), 'withdrew note copy')
  const done = run([{ code: 'CMPT214', term: 'Fall 2025', kind: 'withdrew' }])
  const without = new Set(completedCourses.filter((c) => c !== 'CMPT214'))
  assert([...done.completed].sort().join() === [...without].sort().join(), 'withdrew a completed course == never taken it')
}

// 4. Not offered blocks the term, and un-books a registration in it.
{
  const r = run([{ code: 'CMPT434', term: 'Winter 2027', kind: 'not-offered' }])
  assert(r.blocked.CMPT434?.join() === 'Winter 2027', 'not-offered blocks CMPT434 in Winter 2027')
  assert(!isBooked(r, 'CMPT434') && !r.inProgress.includes('CMPT434'), 'not-offered un-books CMPT434 in Winter 2027')
  const later = run([{ code: 'CMPT370', term: 'Fall 2027', kind: 'later' }, { code: 'CMPT370', term: 'Winter 2028', kind: 'later' }])
  // "Later than T" blocks T and every term before it from the current one on, so the course can't land early.
  assert(later.blocked.CMPT370?.join() === 'Fall 2026,Winter 2027,Spring/Summer 2027,Fall 2027,Winter 2028', 'later blocks every term up to T, in order')
  assert(later.inProgress.includes('CMPT370'), 'later in a future term leaves the current registration alone')
}

// 5. Invalid ones are dropped with a note.
{
  const r = run([
    { code: 'NOPE999', term: 'Fall 2026', kind: 'failed' },
    { code: 'CMPT434', term: 'Winter 2027', kind: 'failed' }, // future
    { code: 'CMPT370', term: 'Fall 2025', kind: 'not-offered' }, // past
    { code: 'CMPT370', term: 'Autumn 2026', kind: 'later' }, // malformed
  ])
  assert(r.valid.length === 0, 'invalid overrides are dropped')
  assert(r.notes.filter((n) => n.code === 'OVERRIDE_INVALID').length === 4, 'each invalid override gets a note')
  assert(r.inProgress.length === inProgressCourses.length && r.completed.size === completedCourses.length, 'invalid overrides change nothing')
}

// 6. Determinism under shuffled input, plus de-duplication and latest-wins.
{
  const os: CourseOverride[] = [
    { code: 'CMPT332', term: 'Fall 2026', kind: 'failed' },
    { code: 'CMPT370', term: 'Winter 2027', kind: 'not-offered' },
    { code: 'CMPT214', term: 'Fall 2025', kind: 'withdrew' },
    { code: 'CMPT214', term: 'Winter 2026', kind: 'failed' },
    { code: 'CMPT332', term: 'Fall 2026', kind: 'failed' },
    { code: 'MATH266', term: 'Fall 2027', kind: 'later' },
  ]
  const base = JSON.stringify(run(os), (_k, v) => (v instanceof Set ? [...v].sort() : v))
  let seed = 7
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648), seed / 2147483648)
  let same = true
  for (let i = 0; i < 25; i++) {
    const shuffled = [...os].sort(() => rand() - 0.5)
    if (JSON.stringify(run(shuffled), (_k, v) => (v instanceof Set ? [...v].sort() : v)) !== base) same = false
  }
  assert(same, 'shuffled overrides give byte-identical results')
  const r = run(os)
  assert(r.valid.filter((o) => o.code === 'CMPT214').length === 1 && r.valid.find((o) => o.code === 'CMPT214')?.term === 'Winter 2026', 'failed/withdrew: the latest term wins')
  assert(r.valid.filter((o) => o.code === 'CMPT332').length === 1, 'duplicates collapse')
  assert(sortOverrides(os).map((o) => o.term).join() === 'Fall 2025,Winter 2026,Fall 2026,Winter 2027,Fall 2027', 'canonical order by term')
  assert(overrideLabel('not-offered', 'Winter 2028') === 'Not running Winter 2028', 'label copy')
}

console.log(failures === 0 ? '\ncheck-overrides: all passed' : `\ncheck-overrides: ${failures} failed`)
process.exit(failures === 0 ? 0 : 1)
