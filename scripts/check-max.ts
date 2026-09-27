// Sanity check for Max's pure scenario logic (api/max/_scenarios.ts): how model-supplied ops are
// cleaned, and how a spoken confirmation is classified before a plan is saved. No database needed.
// Run: node --experimental-strip-types --experimental-loader ./scripts/_resolve-ts-loader.mjs scripts/check-max.ts
import assert from 'node:assert/strict'
import { adapterInput, applyPlanOps, checkAffirmative, checkDecline, cleanOps, normalizeCourseCode, resolveSpecialization, type Snapshot } from '../api/max/_scenarios.ts'
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
assert.equal(refused([{ op: 'ENROLL_ME', courseCode: 'CMPT371' }]), 'UNSUPPORTED_OPERATION', 'an unknown op')
assert.deepEqual(cleanOps([{ op: 'ADD_COURSE', courseCode: 'cmpt 318', term: 'winter 2028' }]), [{ op: 'ADD_COURSE', courseCode: 'CMPT318', term: { season: 'Winter', year: 2028 } }])
assert.deepEqual(cleanOps([{ op: 'MOVE_COURSE', courseCode: 'CMPT370', toTerm: { season: 'summer', year: 2028 } }]), [{ op: 'MOVE_COURSE', courseCode: 'CMPT370', toTerm: { season: 'Spring/Summer', year: 2028 } }])
assert.equal(refused([{ op: 'MOVE_COURSE', courseCode: 'CMPT370' }]), 'INVALID_TERM', 'a move needs a term')
assert.equal(refused([{ op: 'SET_GRAD_TARGET', term: 'soon' }]), 'INVALID_TERM')
assert.deepEqual(cleanOps([{ op: 'SET_MINOR', programId: 'none' }]), [{ op: 'SET_MINOR', programId: null }])
assert.equal(refused([{ op: 'SET_MAJOR', programId: '' }]), 'INVALID_PROGRAM')
assert.deepEqual(cleanOps([{ op: 'SET_INTERNSHIP', year: '3' }]), [{ op: 'SET_INTERNSHIP', year: 3 }])
assert.equal(refused([{ op: 'SET_INTERNSHIP', year: 2 }]), 'INVALID_INTERNSHIP')
assert.equal(refused([{ op: 'DROP_COURSE' }]), 'INVALID_COURSE')
assert.equal(refused([{ op: 'DROP_COURSE', courseCode: 'the hard one' }]), 'INVALID_COURSE')
assert.equal(refused([{ op: 'RESTORE_VERSION', versionNumber: 0 }]), 'UNKNOWN_VERSION')
assert.equal(refused([{ op: 'RESTORE_VERSION', versionNumber: 'two' }]), 'UNKNOWN_VERSION')

// --- a plain no leaves the proposal (the app's Not now); a no that still asks to save stays ambiguous ---
for (const no of ['no', 'No.', 'nope', 'nah, leave it', 'not now', "Don't save that", 'um, no thanks', 'never mind', 'no, forget it']) {
  assert.ok(checkDecline(no), `a no: "${no}"`)
}
for (const notNo of ['no, save it', 'yes', 'no worries, go ahead', 'okay', 'sure, keep it', "I'm not sure"]) {
  assert.ok(!checkDecline(notNo), `not a plain no: "${notNo}"`)
}

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
  pinned: {},
  added: [],
  internshipAYs: { '3': 2027, '4': 2028 },
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

// --- the new powers: courses in terms, graduation targets, program changes (a halfway student) ---
const halfway: Snapshot = {
  ...base,
  completed: completedCourses.slice(0, Math.floor(completedCourses.length / 2)),
  inProgress: [],
  enrolled: [],
  inProgressSeasons: {},
  targetIds: ['software-development'],
  coursesPerTerm: 4,
  start: { season: 'Fall', year: 2027 },
}
const gradOf = (s: Snapshot) => regenerate(adapterInput(s)).terms.at(-1)?.label ?? null
const applied = (raw: unknown[]) => {
  const cleaned = cleanOps(raw)
  assert.ok(Array.isArray(cleaned), JSON.stringify(raw))
  return applyPlanOps(halfway, cleaned)
}
const added = applied([{ op: 'ADD_COURSE', courseCode: 'CMPT318' }])
assert.ok(!('code' in added))
const addedPlan = regenerate(adapterInput(added)).terms
assert.ok(addedPlan.some((t) => t.courses.some((c) => c.code === 'CMPT318')), 'an added course is planned')
assert.ok(validate(addedPlan, adapterInput(added)).ok, 'placed after its prerequisites, in a term that runs it')
const placed = applied([{ op: 'ADD_COURSE', courseCode: 'PHIL140', term: 'Winter 2029' }])
assert.ok(!('code' in placed))
assert.ok(regenerate(adapterInput(placed)).terms.find((t) => t.label === 'Winter 2029')?.courses.some((c) => c.code === 'PHIL140' && c.pinned), 'a placed course sits in its term')
const early = applied([{ op: 'MOVE_COURSE', courseCode: 'STAT242', toTerm: 'Fall 2028' }])
assert.ok(!('code' in early) && !validate(regenerate(adapterInput(early)).terms, adapterInput(early)).ok, 'a move that breaks the rules is shown, never saved')
const past = applied([{ op: 'ADD_COURSE', courseCode: 'PHIL140', term: 'Fall 2026' }])
assert.equal('code' in past && past.code, 'TERM_PAST')
const faster = applied([{ op: 'SET_GRAD_TARGET', term: 'Winter 2030' }])
assert.ok(!('code' in faster) && gradOf(faster) === 'Winter 2030', 'a graduation target is met by the lightest load that makes it')
const impossible = applied([{ op: 'SET_GRAD_TARGET', term: 'Winter 2027' }])
assert.equal('code' in impossible && impossible.code, 'CANT_MEET_TARGET')
const minor = applied([{ op: 'SET_MINOR', programId: 'Statistics' }])
assert.ok(!('code' in minor) && minor.minorProgramId === 'statistics-minor' && minor.targetIds.length > 1, 'a minor adds its lists')
const noMinor = applyPlanOps(minor as Snapshot, cleanOps([{ op: 'SET_MINOR', programId: null }]) as never)
assert.ok(!('code' in noMinor) && noMinor.minorProgramId === null && noMinor.targetIds.length === 1, 'and taking it off removes them')
const major = applied([{ op: 'SET_MAJOR', programId: 'Applied Computing' }])
assert.ok(!('code' in major) && major.targetProgramId === 'applied-computing' && major.degreeVariant === null)
const honours = applied([{ op: 'SET_DEGREE', variant: 'honours' }])
assert.ok(!('code' in honours) && honours.degreeVariant === 'bsc-honours')
const away = applied([{ op: 'SET_INTERNSHIP', year: 3 }])
assert.ok(!('code' in away) && away.away === 2027 && away.internship === 3 && gradOf(away) !== gradOf(halfway), 'an internship year pushes the plan on')

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
