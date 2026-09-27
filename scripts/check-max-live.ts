// Sanity check for Max live on the Skill Tree: the tree diff the animation runs on, the frames a
// multi-step change produces, the size of what's broadcast, and how long the planner takes (each tool
// call builds a few plans while the student waits). Pure — no database, no network.
// Run: node --experimental-strip-types --experimental-loader ./scripts/_resolve-ts-loader.mjs scripts/check-max-live.ts
import assert from 'node:assert/strict'
import { adapterInput, applyPlanOps, captionOf, cleanOps, liveInputs, type Snapshot } from '../api/max/_scenarios.ts'
import { diffLayouts, ghostTop } from '../src/maxLive/treeDiff.ts'
import { currentTermOf, layoutSkillTree } from '../src/lib/skillTree.ts'
import { regenerate } from '../src/lib/max/planningAdapter.ts'
import { isElective, type PlannedTerm } from '../src/lib/plan.ts'
import type { LiveEvent } from '../src/lib/max/live.ts'
import { completedCourses, inProgressCourses, inProgressTerms } from '../src/data/transcript.ts'

const TODAY = new Date(2026, 8, 27)

const sample: Snapshot = {
  completed: completedCourses,
  inProgress: inProgressCourses,
  enrolled: inProgressCourses,
  droppedCourses: [],
  targetProgramId: 'computer-science',
  minorProgramId: null,
  targetIds: ['software-development'],
  coursesPerTerm: 5,
  springSummer: false,
  summerPerTerm: 2,
  start: { season: 'Winter', year: 2027 },
  inProgressSeasons: inProgressTerms,
  degreeVariant: null,
  away: null,
  today: TODAY,
}

function layoutOf(s: Snapshot, plan: PlannedTerm[], width = 1100) {
  return layoutSkillTree({ completed: s.completed, inProgress: s.inProgress, plan, currentTerm: currentTermOf(TODAY), targets: [], width })
}

// --- the tree diff: dropping a course you're taking re-plans it, so it MOVES, it doesn't vanish ---
const ops = cleanOps([{ op: 'DROP_COURSE', courseCode: 'CMPT370' }])
assert.ok(Array.isArray(ops))
const dropped = applyPlanOps(sample, ops)
assert.ok(!('code' in dropped))
const before = layoutOf(sample, regenerate(adapterInput(sample)).terms)
const after = layoutOf(dropped, regenerate(adapterInput(dropped)).terms)
const d = diffLayouts(before, after)
assert.ok(
  d.moved.some((m) => m.code === 'CMPT370') || d.restatus.includes('CMPT370'),
  'CMPT370 goes from Taking now to Planned: moved or restatused, never pruned',
)
assert.ok(!d.pruned.some((n) => n.code === 'CMPT370'))
const sprouted = new Set(d.sprouted)
assert.ok(d.pruned.every((n) => !sprouted.has(n.code)), 'no course is both sprouted and pruned')
assert.ok([...d.sprouted, ...d.pruned.map((n) => n.code)].every((c) => !isElective(c)), 'elective placeholders never sprout or prune')
assert.ok(d.moved.some((m) => m.code === 'CMPT371' || m.code === 'CMPT470'), 'what CMPT370 unlocks shifts a year')
// A plan compared with itself: nothing changes.
const same = diffLayouts(before, before)
assert.deepEqual([same.sprouted, same.pruned, same.moved, same.restatus], [[], [], [], []])
// Ghosts keep their distance from the (pinned) roots.
for (const n of d.pruned) assert.equal(after.height - ghostTop(n, before, after), before.height - n.y)

// --- a specialization switch prunes one branch's courses and sprouts another's ---
const half = completedCourses.slice(0, Math.floor(completedCourses.length / 2))
const halfSnap: Snapshot = { ...sample, completed: half, inProgress: [], enrolled: [], inProgressSeasons: {}, start: { season: 'Fall', year: 2027 } }
const switchOps = cleanOps([{ op: 'SET_SPECIALIZATIONS', specializationIds: ['Artificial Intelligence'] }])
assert.ok(Array.isArray(switchOps))
const switched = applyPlanOps(halfSnap, switchOps)
assert.ok(!('code' in switched))
const sd = diffLayouts(layoutOf(halfSnap, regenerate(adapterInput(halfSnap)).terms), layoutOf(switched, regenerate(adapterInput(switched)).terms))
assert.ok(sd.sprouted.length > 0 && sd.pruned.length > 0, `a switch restructures the tree (sprouted ${sd.sprouted.length}, pruned ${sd.pruned.length})`)

// --- frames: one per op, each a whole valid plan, captions a student can read ---
const seq = cleanOps([
  { op: 'SET_PREFERENCE', key: 'maxCoursesPerTerm', value: 4 },
  { op: 'SET_PREFERENCE', key: 'springSummer', value: true },
  { op: 'SET_SPECIALIZATIONS', specializationIds: ['cybersecurity'] },
])
assert.ok(Array.isArray(seq))
const frames = seq.map((_, i) => {
  const step = applyPlanOps(halfSnap, seq.slice(0, i + 1))
  assert.ok(!('code' in step))
  return { caption: captionOf(seq[i], halfSnap.targetProgramId, halfSnap.completed), terms: regenerate(adapterInput(step)).terms, inputs: liveInputs(step) }
})
assert.deepEqual(
  frames.map((f) => f.caption),
  ['4 courses a term', 'Using Spring/Summer terms', 'Switching to Cybersecurity'],
)
assert.ok(frames[0].terms.every((t) => t.courses.length <= 4), 'the first frame is already at the new pace')
assert.ok(frames[1].terms.some((t) => t.label.startsWith('Spring/Summer')), 'the second frame grows summer rows')

// --- what's broadcast stays small (Supabase Broadcast messages; keep well under 64 KB) ---
const event: LiveEvent = {
  type: 'scenario.presented',
  seq: Date.now(),
  scenario: {
    scenarioId: '1',
    status: 'presented',
    presentedHash: 'x'.repeat(64),
    requiresAppConfirmation: true,
    headline: ['Graduation moves from Winter 2031 to Fall 2030.'],
    errors: [],
    graduation: { before: 'Winter 2031', after: 'Fall 2030' },
    frames,
  },
}
const bytes = Buffer.byteLength(JSON.stringify(event))
assert.ok(bytes < 64_000, `a 3-step proposal broadcasts ${bytes} bytes`)

// --- the planner is fast enough to run a few times inside one tool call ---
const fresh: Snapshot = { ...halfSnap, completed: [], start: { season: 'Fall', year: 2027 } }
const t0 = performance.now()
const runs = 10
for (let i = 0; i < runs; i++) regenerate(adapterInput(fresh))
const ms = (performance.now() - t0) / runs
assert.ok(ms < 250, `a whole-degree plan takes ${ms.toFixed(1)} ms`)

console.log(
  `check-max-live.ts: all assertions passed (drop moves CMPT370; switch sprouts ${sd.sprouted.length}/prunes ${sd.pruned.length}; 3-step proposal ${(bytes / 1024).toFixed(1)} KB; whole-degree plan ${ms.toFixed(1)} ms)`,
)
