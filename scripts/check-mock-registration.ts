// Sanity check for the practice run. Run: node --experimental-strip-types scripts/check-mock-registration.ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import type { RegPick, RegPlan } from '../src/lib/registration.ts'
import {
  clear,
  hasSavedRun,
  load,
  READY_TEXT,
  save,
  scriptFromPlan,
  sectionsFor,
  storageKey,
  type RegState,
} from '../src/lib/mockRegistration.ts'

// A synthetic plan shaped like the sample student's Winter 2027: two slot picks (one with a linked
// lab), a booked course for context, and a course Max couldn't place.
function pick(p: Partial<RegPick> & Pick<RegPick, 'code' | 'crn' | 'section'>): RegPick {
  return {
    title: p.code,
    type: 'Lecture',
    main: true,
    credits: 3,
    meetings: [{ days: ['Mon', 'Wed', 'Fri'], start: '09:30', end: '10:20' }],
    seats: 12,
    status: 'open',
    ...p,
  }
}

const plan: Pick<RegPlan, 'picks' | 'booked' | 'unplaced' | 'crns'> = {
  picks: [
    pick({ code: 'INDG107', crn: '21001', section: '01', slotLabel: 'Indigenous learning', meetings: [{ days: ['Tue', 'Thu'], start: '11:30', end: '12:50' }] }),
    pick({ code: 'CHEM112', crn: '22002', section: '04', slotLabel: 'Junior science: Biology, Chemistry or Earth Science', meetings: [{ days: ['Tue', 'Thu'], start: '10:00', end: '11:20' }] }),
    pick({ code: 'CHEM112', crn: '22010', section: 'LC4', type: 'Laboratory', main: false, credits: 0, meetings: [{ days: ['Wed'], start: '14:30', end: '17:20' }] }),
  ],
  booked: [
    pick({ code: 'CMPT340', crn: '28326', section: '04', meetings: [{ days: ['Mon', 'Wed'], start: '10:30', end: '11:20' }, { days: ['Fri'], start: '10:30', end: '11:20' }] }),
  ],
  unplaced: [{ code: 'BIOL120', title: 'The Nature of Life', reason: 'full', text: 'Every main-campus lecture of BIOL 120 is full.' }],
  crns: ['21001', '22002', '22010'],
}

// --- deterministic: same input, same output ---
const a = scriptFromPlan(plan)
assert.deepEqual(a, scriptFromPlan(plan), 'the script is deterministic for the same plan')

// --- rows are the picks, in order; booked stays context ---
assert.deepEqual(a.rows.map((r) => r.crn), plan.crns, 'rows are exactly the picks, in order')
assert.ok(a.rows.every((r) => r.status === 'pending'), 'picks start pending')
assert.deepEqual(a.booked.map((r) => r.crn), ['28326'], 'booked courses are context rows')
assert.equal(a.booked[0].meetings.length, 2, 'a section keeps every meeting')
assert.equal(a.rows.find((r) => r.crn === '22010')!.credits, 0, 'a linked lab carries no credit units')
assert.equal(a.rows.filter((r) => r.main).reduce((s, r) => s + r.credits, 0), 6, 'credits count the lectures only')

// --- every step points at something real; each pick is added exactly once; one ready beat, last ---
for (const step of a.steps) {
  if (step.rowIndex !== undefined) assert.ok(a.rows[step.rowIndex], `step ${step.action} points at a real row`)
  if (step.courseIndex !== undefined) assert.ok(a.courses[step.courseIndex], `step ${step.action} points at a real course`)
  if (step.action === 'add') {
    assert.ok(step.rowIndex !== undefined, 'an add step names its row')
    assert.equal(a.courses[step.courseIndex!].code, a.rows[step.rowIndex!].code, 'an add step adds a section of the course on screen')
  }
}
const adds = a.steps.filter((s) => s.action === 'add').map((s) => s.rowIndex)
assert.deepEqual(adds, a.rows.map((_, i) => i), 'each pick is added once, in order')
// Max never presses Submit, simulated or real: the script has no submit beat at all.
assert.ok(!a.steps.some((s) => (s.action as string) === 'submit' || /submitting/i.test(s.text)), 'Max never submits')
assert.equal(a.steps.filter((s) => s.action === 'ready').length, 1, 'exactly one ready beat')
assert.equal(a.steps[a.steps.length - 1].action, 'ready', 'the ready beat comes last')
assert.equal(a.steps.at(-1)!.text, "Everything's in your summary. Press Submit when you're ready.")
assert.equal(READY_TEXT, a.steps.at(-1)!.text)
assert.deepEqual(a.courses.map((c) => c.code), ['INDG107', 'CHEM112'], 'each course is searched once')
assert.ok(a.steps.some((s) => s.text === 'Indigenous learning: INDG 107 fits'), 'a slot pick says which slot it fills')
assert.ok(a.steps.some((s) => s.text === 'Junior science: CHEM 112 fits'), "a narrowed slot's areas aren't repeated")
assert.ok(a.steps.some((s) => s.action === 'note' && s.text.includes('BIOL 120')), 'an unplaced course is narrated')

// --- an empty plan still ends on the ready beat and adds nothing ---
const empty = scriptFromPlan({ picks: [], booked: [], unplaced: [] })
assert.deepEqual(empty.rows, [], 'no picks, no rows')
assert.deepEqual(empty.steps.map((s) => s.action), ['ready'], 'no picks, just the ready beat')

// --- the page: only the student's tap on Submit finalizes, and reduced motion stops at ready ---
// (A source check: the screen is React, so it's read, not run.)
const page = readFileSync(new URL('../src/screens/register/PracticeRun.tsx', import.meta.url), 'utf8')
assert.equal((page.match(/save\(scope/g) ?? []).length, 1, 'the run is saved in one place')
assert.match(page, /function submit\(\) \{\n    if \(!ready\) return/, 'finalizing waits for the ready beat')
assert.match(page, /onClick=\{submit\}/, "and runs only from the simulated Submit's own tap")
assert.doesNotMatch(page, /saved \|\| stepIndex < steps\.length|setStepIndex\(steps\.length\)|reduce \? script\.steps\.length/, 'nothing runs the script past its ready beat')
assert.match(page, /stepIndex: reduce \? readyIndex : 0/, 'reduced motion opens on the ready beat')
assert.match(page, /setStepIndex\(reduce \? readyIndex : 0\)/, 'and a reset under reduced motion returns to it')
assert.match(page, /Simulated · demo/, 'the page says it is simulated')

// --- the offline fallback's practice sections stay deterministic ---
assert.deepEqual(sectionsFor('CMPT370', true), sectionsFor('CMPT370', true), 'practice sections are deterministic')

// --- the saved run is scoped to the student, the term and the exact CRNs ---
const store = new Map<string, string>()
Object.assign(globalThis, {
  localStorage: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size
    },
  },
})
const scope = { uid: 'uid-1', termLabel: 'Winter 2027', crns: plan.crns }
assert.equal(storageKey(scope), 'studymax:mock-registration:uid-1:Winter 2027:21001,22002,22010', 'the key format')
assert.equal(storageKey({ ...scope, uid: null }), 'studymax:mock-registration:guest:Winter 2027:21001,22002,22010', 'guests are "guest"')
const state: RegState = { termLabel: 'Winter 2027', rows: a.rows, submittedAt: '2026-09-27T08:00:00.000Z' }
save(scope, state)
assert.deepEqual(load(scope), state, 'a saved run loads back for the same scope')
assert.equal(load({ ...scope, uid: 'uid-2' }), null, "another student doesn't see it")
assert.equal(load({ ...scope, uid: null }), null, "a guest doesn't see a student's run")
assert.equal(load({ ...scope, termLabel: 'Fall 2027' }), null, "another term doesn't see it")
assert.equal(load({ ...scope, crns: ['21001'] }), null, "a changed list of CRNs doesn't see it")
assert.ok(hasSavedRun('uid-1', 'Winter 2027'), 'the Plan knows a run was saved')
assert.ok(!hasSavedRun(null, 'Winter 2027'), 'but not for a guest')
clear(scope)
assert.equal(load(scope), null, 'clear removes it')
assert.ok(!hasSavedRun('uid-1', 'Winter 2027'), 'and the Plan forgets it')

console.log('check-mock-registration: ok')
