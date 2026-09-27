// Sanity check for src/lib/max/planningAdapter.ts against the exact seeded-demo-student numbers
// verified in docs/BayMax/implementation/01-seed-demo-student.md and 03-planning-and-audit-adapter.md.
// Run: node --experimental-strip-types scripts/check-planning-adapter.ts
import assert from 'node:assert/strict'
import { regenerate, validate, diff } from '../src/lib/max/planningAdapter.ts'
import { completedCourses, inProgressCourses } from '../src/data/transcript.ts'

const START = { season: 'Winter' as const, year: 2027 }
const baseInput = {
  completed: new Set(completedCourses),
  inProgress: new Set(inProgressCourses),
  targetProgramId: 'computer-science',
  targetSpecializationIds: ['software-development'],
  coursesPerTerm: 4,
  start: START,
}

// --- determinism: same inputs, byte-identical output ---
const before = regenerate(baseInput).terms
assert.deepEqual(before, regenerate(baseInput).terms, 'regenerate is deterministic')
assert.deepEqual(
  before.map((t) => ({ label: t.label, codes: t.courses.map((c) => c.code) })),
  [{ label: 'Winter 2027', codes: ['CMPT371', 'CMPT470'] }],
  'seeded student\'s current plan matches the verified "before" plan',
)

// --- dropping CMPT370 from in-progress pushes graduation out ---
// Re-verified after src/lib/plan.ts became offerings-aware (src/data/offerings.ts): CMPT371 and
// CMPT470 both only run in Winter, so once CMPT370 is no longer done, they can't land in the very
// next (Fall) term anymore — they wait for the Winter after that. A full year out, not one term;
// still a real, correct, and if anything more dramatic demo moment.
const droppedInProgress = new Set(inProgressCourses.filter((c) => c !== 'CMPT370'))
assert.ok(inProgressCourses.includes('CMPT370'), 'CMPT370 must actually be in-progress for this to test anything')
const after = regenerate({ ...baseInput, inProgress: droppedInProgress }).terms
assert.deepEqual(
  after.map((t) => ({ label: t.label, codes: t.courses.map((c) => c.code) })),
  [
    { label: 'Winter 2027', codes: ['CMPT370'] },
    { label: 'Winter 2028', codes: ['CMPT371', 'CMPT470'] },
  ],
  'dropping CMPT370 matches the verified "after" plan',
)

// --- diff produces the demo's headline and moved entries ---
const result = diff(before, after)
assert.ok(result.headline.length > 0, 'headline is non-empty when graduation changes')
assert.equal(result.headline[0], 'Graduation moves from Winter 2027 to Winter 2028.', 'graduation headline is first')
assert.deepEqual(result.graduation, { before: 'Winter 2027', after: 'Winter 2028', changed: true })
assert.deepEqual(result.added.sort(), ['CMPT370'])
assert.deepEqual(result.removed, [])
assert.deepEqual(
  result.moved.sort((a, b) => a.code.localeCompare(b.code)),
  [
    { code: 'CMPT371', from: 'Winter 2027', to: 'Winter 2028' },
    { code: 'CMPT470', from: 'Winter 2027', to: 'Winter 2028' },
  ],
)

// --- validate never returns an ERROR for anything this adapter can currently produce ---
assert.equal(validate(before).ok, true)
assert.deepEqual(validate(before).issues, [])
assert.equal(validate(after).ok, true)

// --- a no-op diff (same plan twice) has no headline and no moves ---
const noOp = diff(before, before)
assert.deepEqual(noOp.headline, [])
assert.deepEqual(noOp.moved, [])
assert.deepEqual(noOp.added, [])
assert.deepEqual(noOp.removed, [])

console.log('check-planning-adapter.ts: all assertions passed')
