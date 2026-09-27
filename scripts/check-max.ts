// Sanity check for Max's pure scenario logic (api/max/_scenarios.ts): how model-supplied ops are
// cleaned, and how a spoken confirmation is classified before a plan is saved. No database needed.
// Run: node --experimental-strip-types --experimental-loader ./scripts/_resolve-ts-loader.mjs scripts/check-max.ts
import assert from 'node:assert/strict'
import { adapterInput, applyPlanOps, checkAffirmative, cleanOps, normalizeCourseCode, resolveSpecialization, type Snapshot } from '../api/max/_scenarios.ts'
import { parseCallPlanInputs } from '../src/lib/max/callInputs.ts'
import { finishShift, planOptions } from '../src/lib/max/options.ts'
import { planHash, regenerate, validate } from '../src/lib/max/planningAdapter.ts'
import { completedCourses, inProgressCourses, inProgressTerms } from '../src/data/transcript.ts'

// --- course codes as a voice model says them ---
for (const said of ['CMPT370', 'CMPT 370', 'cmpt 370', 'Cmpt-370', ' CMPT370 ']) {
  assert.equal(normalizeCourseCode(said), 'CMPT370', `"${said}"`)
}
assert.equal(normalizeCourseCode(undefined), '')

// --- ops: cleaned, or refused with a speakable error ---
assert.deepEqual(cleanOps([{ op: 'DROP_COURSE', courseCode: 'cmpt 370' }]), [{ op: 'DROP_COURSE', courseCode: 'CMPT370' }])
assert.deepEqual(cleanOps([{ op: 'RESTORE_VERSION', versionNumber: '2' }]), [{ op: 'RESTORE_VERSION', versionNumber: 2 }])
const refused = (raw: unknown) => {
  const r = cleanOps(raw)
  return 'code' in r ? r.code : 'accepted'
}
assert.equal(refused([]), 'MISSING_OPS')
assert.equal(refused(undefined), 'MISSING_OPS')
assert.equal(refused([{ op: 'ADD_COURSE', courseCode: 'CMPT371' }]), 'UNSUPPORTED_OPERATION', 'not supported this weekend')
assert.equal(refused([{ op: 'SET_MAJOR', programId: 'math' }]), 'UNSUPPORTED_OPERATION', 'program changes never over voice')
assert.equal(refused([{ op: 'DROP_COURSE' }]), 'INVALID_COURSE')
assert.equal(refused([{ op: 'DROP_COURSE', courseCode: 'the hard one' }]), 'INVALID_COURSE')
assert.equal(refused([{ op: 'RESTORE_VERSION', versionNumber: 0 }]), 'UNKNOWN_VERSION')
assert.equal(refused([{ op: 'RESTORE_VERSION', versionNumber: 'two' }]), 'UNKNOWN_VERSION')

// --- a clear yes saves; anything else re-asks (a false no costs one question, a false yes a plan) ---
const yes = [
  'yes',
  'Yes.',
  'yeah',
  'Yep, save it',
  'yup',
  'sure',
  'okay',
  'Okay, yeah, save it.',
  'um, yes please',
  'go ahead',
  "let's do it",
  'please do',
  'sounds good',
  'absolutely',
  'save it',
]
for (const u of yes) assert.deepEqual(checkAffirmative(u), { ok: true }, `yes: "${u}"`)

const notYes: [string, string][] = [
  ['no', 'negation'],
  ['nope', 'negation'],
  ["don't save it", 'negation'],
  ['dont', 'negation'],
  ['don’t do that', 'negation'],
  ['yes, but only if it stays in Fall', 'hedge'],
  ['maybe', 'hedge'],
  ['I guess', 'hedge'],
  ['hold on', 'hedge'],
  ['yes, wait', 'hedge'],
  ['what does that do to my Fall?', 'question'],
  ['hmm', 'no_match'],
  ['', 'no_match'],
]
for (const [u, reason] of notYes) assert.deepEqual(checkAffirmative(u), { ok: false, reason }, `not yes: "${u}"`)

// --- the new powers: pace, summers, a specialization switch ---
assert.deepEqual(cleanOps([{ op: 'SET_PREFERENCE', key: 'maxCoursesPerTerm', value: '4' }]), [{ op: 'SET_PREFERENCE', key: 'maxCoursesPerTerm', value: 4 }])
assert.deepEqual(cleanOps([{ op: 'SET_PREFERENCE', key: 'springSummer', value: 'yes' }]), [{ op: 'SET_PREFERENCE', key: 'springSummer', value: true }])
assert.equal(refused([{ op: 'SET_PREFERENCE', key: 'maxCoursesPerTerm', value: 9 }]), 'INVALID_PREFERENCE', 'over the app’s 5-a-term cap')
assert.equal(refused([{ op: 'SET_PREFERENCE', key: 'maxSummerCourses', value: 0 }]), 'INVALID_PREFERENCE')
assert.equal(refused([{ op: 'SET_PREFERENCE', key: 'favouriteColour', value: 'red' }]), 'UNSUPPORTED_OPERATION')
assert.deepEqual(cleanOps([{ op: 'SET_SPECIALIZATIONS', specializationIds: 'software development' }]), [
  { op: 'SET_SPECIALIZATIONS', specializationIds: ['software development'] },
])
assert.equal(refused([{ op: 'SET_SPECIALIZATIONS', specializationIds: [] }]), 'INVALID_SPECIALIZATION')

assert.equal(resolveSpecialization('computer-science', [], 'Software Development')?.id, 'software-development', 'spoken name')
assert.equal(resolveSpecialization('computer-science', [], 'software-development')?.id, 'software-development', 'id')
assert.equal(resolveSpecialization('computer-science', [], 'cyber security')?.id, 'cybersecurity', 'spaces ignored')
assert.equal(resolveSpecialization('computer-science', [], 'underwater basket weaving'), null)

// A sequence on the sample student: drop + pace + switch, a certificate kept in the canopy.
const base: Snapshot = {
  completed: completedCourses,
  inProgress: inProgressCourses,
  enrolled: inProgressCourses,
  droppedCourses: [],
  targetProgramId: 'computer-science',
  minorProgramId: null,
  targetIds: ['software-development', 'certificate-computing-placeholder'],
  coursesPerTerm: 5,
  springSummer: false,
  summerPerTerm: 2,
  start: { season: 'Winter', year: 2027 },
  inProgressSeasons: inProgressTerms,
  degreeVariant: null,
  away: null,
  today: new Date(2026, 8, 27),
}
const ops = cleanOps([
  { op: 'DROP_COURSE', courseCode: 'CMPT 370' },
  { op: 'SET_PREFERENCE', key: 'maxCoursesPerTerm', value: 4 },
  { op: 'SET_SPECIALIZATIONS', specializationIds: ['Cybersecurity'] },
])
assert.ok(Array.isArray(ops))
const after = applyPlanOps(base, ops)
assert.ok(!('code' in after), 'the sequence applies')
assert.deepEqual(after.droppedCourses, ['CMPT370'])
assert.ok(!after.inProgress.includes('CMPT370'))
assert.equal(after.coursesPerTerm, 4)
assert.deepEqual(after.targetIds, ['cybersecurity', 'certificate-computing-placeholder'], 'the switch replaces the specialization, keeps the rest')
assert.equal(base.coursesPerTerm, 5, 'pure: the base snapshot is untouched')
const afterPlan = regenerate(adapterInput(after)).terms
assert.ok(validate(afterPlan, adapterInput(after)).ok, 'the resulting plan keeps every hard constraint')
assert.ok(afterPlan.every((t) => t.courses.length <= 4), 'at the new pace')
const dropTwice = applyPlanOps({ ...base, droppedCourses: ['CMPT370'], inProgress: inProgressCourses.filter((c) => c !== 'CMPT370') }, [
  { op: 'DROP_COURSE', courseCode: 'CMPT370' },
])
assert.equal('code' in dropTwice && dropTwice.code, 'ALREADY_DROPPED')

// --- the app's plan inputs: parsed strictly, never trusted ---
const good = {
  programId: 'computer-science',
  completed: completedCourses,
  inProgress: inProgressCourses,
  inProgressSeasons: inProgressTerms,
  targetIds: ['software-development'],
  concentrationIds: ['software-development'],
  minorId: null,
  degreeVariant: 'bsc-4',
  away: null,
  coursesPerTerm: 5,
  springSummer: false,
  summerPerTerm: 2,
  start: { season: 'Winter', year: 2027 },
  today: '2026-09-27',
  planHash: 'x',
}
assert.ok('inputs' in parseCallPlanInputs(good))
const rejectedFor = (patch: Record<string, unknown>) => {
  const r = parseCallPlanInputs({ ...good, ...patch })
  return 'rejected' in r ? r.rejected : 'accepted'
}
assert.equal(rejectedFor({ programId: 'nope' }), 'program')
assert.equal(rejectedFor({ completed: ['CMPT 141'] }), 'courses', 'codes must be catalogue format')
assert.equal(rejectedFor({ inProgressSeasons: { CMPT370: 'Autumn' } }), 'seasons')
assert.equal(rejectedFor({ coursesPerTerm: 40 }), 'load')
assert.equal(rejectedFor({ start: { season: 'Fall', year: 1990 } }), 'start')
assert.equal(rejectedFor({ today: 'tomorrow' }), 'today')
assert.equal(rejectedFor({ targetIds: 'software-development' }), 'targets')
assert.equal('rejected' in parseCallPlanInputs(null), true)

// --- recommendations: every option's ops apply, and its graduation is the plan it would give ---
assert.equal(finishShift('Winter 2027', 'Winter 2028'), 'a year later')
assert.equal(finishShift('Winter 2028', 'Fall 2027'), '4 months sooner')
assert.equal(finishShift('Fall 2027', 'Fall 2027'), 'same finish')
const half = completedCourses.slice(0, Math.floor(completedCourses.length / 2))
const halfSnap: Snapshot = { ...base, completed: half, inProgress: [], enrolled: [], targetIds: ['software-development'], inProgressSeasons: {} }
for (const about of ['pace', 'summer', 'specialization'] as const) {
  const r = planOptions(adapterInput(halfSnap), about)
  assert.deepEqual(r, planOptions(adapterInput(halfSnap), about), `${about}: deterministic`)
  assert.ok(r.options.length > 0 && r.options.length <= 3, `${about}: 1-3 options`)
  for (const o of r.options) {
    const cleaned = cleanOps(o.ops)
    assert.ok(Array.isArray(cleaned), `${about}: "${o.label}" ops pass cleanOps`)
    const applied = applyPlanOps(halfSnap, cleaned)
    assert.ok(!('code' in applied), `${about}: "${o.label}" ops apply`)
    const terms = regenerate(adapterInput(applied)).terms
    assert.equal(terms[terms.length - 1]?.label ?? null, o.graduation, `${about}: "${o.label}" graduation is what the tree will draw`)
    assert.ok(validate(terms, adapterInput(applied)).ok, `${about}: "${o.label}" keeps every hard constraint`)
  }
}
// Summers on can only help; so can a lighter load never finish sooner.
const pace = planOptions(adapterInput(halfSnap), 'pace')
assert.ok(pace.options.every((o) => !(o.label.startsWith('3') && o.vsNow.endsWith('sooner'))), 'a lighter load never finishes sooner')
// planHash is stable and discriminating.
assert.equal(planHash(regenerate(adapterInput(base)).terms), planHash(regenerate(adapterInput(base)).terms))
assert.notEqual(planHash(regenerate(adapterInput(base)).terms), planHash(afterPlan))

console.log(`check-max.ts: all assertions passed (${yes.length} yeses, ${notYes.length} not-yeses, op cleaning, new powers, call inputs, recommendations)`)
