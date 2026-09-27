// Sanity check for src/lib/max/planningAdapter.ts against the seeded demo student
// (docs/BayMax/implementation/01-seed-demo-student.md and 03-planning-and-audit-adapter.md), planned
// the way the app and api/session.ts plan it: the program's degree (the Four-year for CS), the
// student's own loads (5 a term, the app's default, as scripts/seed-demo-student.ts stores), booked
// courses. Elective slots are left out of the course assertions: the demo story is about named courses.
// Run: node --experimental-strip-types --experimental-loader ./scripts/_resolve-ts-loader.mjs scripts/check-planning-adapter.ts
import assert from 'node:assert/strict'
import { regenerate, validate, diff } from '../src/lib/max/planningAdapter.ts'
import { isElective, type PlannedTerm } from '../src/lib/plan.ts'
import { completedCourses, inProgressCourses } from '../src/data/transcript.ts'

const START = { season: 'Winter' as const, year: 2027 }
const baseInput = {
  completed: new Set(completedCourses),
  inProgress: new Set(inProgressCourses),
  targetProgramId: 'computer-science',
  targetSpecializationIds: ['software-development'],
  coursesPerTerm: 5,
  start: START,
}
const named = (terms: PlannedTerm[]) =>
  terms
    .map((t) => ({ label: t.label, codes: t.courses.map((c) => c.code).filter((c) => !isElective(c)) }))
    .filter((t) => t.codes.length > 0)
const byCode = (a: { code: string }, b: { code: string }) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0)

// --- determinism: same inputs, byte-identical output ---
const first = regenerate(baseInput)
const before = first.terms
assert.deepEqual(before, regenerate(baseInput).terms, 'regenerate is deterministic')
assert.deepEqual(
  named(before),
  [{ label: 'Winter 2027', codes: ['CMPT371', 'CMPT470'] }],
  'seeded student\'s current plan matches the verified "before" plan',
)
assert.equal(before.at(-1)?.label, 'Winter 2027', 'the whole degree finishes in Winter 2027 at 5 a term')
assert.ok(before.flatMap((t) => t.courses).some((c) => isElective(c.code)), 'the plan is the whole degree: it has elective slots')
assert.ok(before.every((t) => t.courses.length <= 5), 'no term holds more than the load')

// --- the inputs the plan was built from, normalised for PlanVersion.inputsHash ---
assert.equal(first.inputs.degree, 'usask-cmpt-bsc-4', "the program's default degree (degreeVariant is device-only)")
assert.equal(first.inputs.load, 5)
assert.equal(first.inputs.summer, 0, 'Spring/Summer omitted is off')
const shuffled = regenerate({
  ...baseInput,
  completed: new Set([...completedCourses].reverse()),
  inProgress: new Set([...inProgressCourses].reverse()),
})
assert.equal(JSON.stringify(shuffled.inputs), JSON.stringify(first.inputs), 'inputs are sorted: order never changes the hash')
assert.deepEqual(shuffled.terms, before, 'input order never changes the plan')
assert.equal(regenerate({ ...baseInput, springSummer: true, summerPerTerm: 0 }).inputs.summer, 0, 'Spring/Summer on with 0 courses is off')
assert.equal(regenerate({ ...baseInput, springSummer: true, summerPerTerm: 3 }).inputs.summer, 2, 'a stored 3 becomes 2')
assert.equal(regenerate({ ...baseInput, springSummer: false, summerPerTerm: 2 }).inputs.summer, 0, 'off means 0')
assert.equal(regenerate({ ...baseInput, coursesPerTerm: 9 }).inputs.load, 5, 'the load clamps to 1-5')
assert.equal(regenerate({ ...baseInput, degreeVariant: 'bsc-honours' }).inputs.degree, 'usask-cmpt-bsc-honours')
const four = regenerate({ ...baseInput, coursesPerTerm: 4 }).terms
assert.ok(four.every((t) => t.courses.length <= 4), 'a load of 4 is honoured, not hardcoded')
// Taking now, booked in the term running today (before the plan starts), changes nothing.
const booked = regenerate({ ...baseInput, booked: { 'Fall 2026': [...inProgressCourses] } })
assert.deepEqual(
  booked.terms.map((t) => [t.label, t.courses.map((c) => c.code)]),
  before.map((t) => [t.label, t.courses.map((c) => c.code)]),
  'courses booked in the current term leave the plan as is',
)
assert.deepEqual(booked.inputs.booked, [['Fall 2026', [...inProgressCourses].sort()]])

// --- dropping CMPT370 from in-progress pushes graduation out ---
// CMPT371 and CMPT470 both only run in Winter, so once CMPT370 is no longer done, they can't land
// in the very next (Fall) term: they wait for the Winter after that. A full year out.
const droppedInProgress = new Set(inProgressCourses.filter((c) => c !== 'CMPT370'))
assert.ok(inProgressCourses.includes('CMPT370'), 'CMPT370 must actually be in-progress for this to test anything')
const after = regenerate({ ...baseInput, inProgress: droppedInProgress }).terms
assert.deepEqual(
  named(after),
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
assert.deepEqual(result.added.filter((c) => !isElective(c)).sort(), ['CMPT370'])
assert.deepEqual(result.removed.filter((c) => !isElective(c)), [])
assert.deepEqual(
  result.moved.filter((m) => !isElective(m.code)).sort(byCode),
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
