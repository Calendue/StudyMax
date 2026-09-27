// Sanity check for cross-program credential matching.
// Run: node --experimental-strip-types --experimental-loader ./scripts/_resolve-ts-loader.mjs scripts/check-credentials.ts
import assert from 'node:assert/strict'
import { computeCredentials } from '../src/lib/credentials.ts'
import { programs } from '../src/data/programs/index.ts'
import { computerScience } from '../src/data/programs/computerScience.ts'
import { statisticsMinor } from '../src/data/programs/statisticsMinor.ts'

const completed = new Set(computerScience.sampleTranscript ?? [])
assert.ok(completed.size > 0, 'the CS sample transcript should exist')

const credentials = computeCredentials(programs, completed, computerScience.id)

// --- only certificates and minors, never majors, never empty stubs ---
assert.ok(credentials.length > 0, 'a CS student should match at least one credential')
assert.ok(
  credentials.every((c) => c.program.kind === 'certificate' || c.program.kind === 'minor'),
  'majors must never appear as add-on credentials',
)
assert.ok(
  credentials.every((c) => c.totalRequired > 0),
  'a credential with no encoded requirements must not be offered',
)

// --- sorted closest-first ---
assert.ok(
  credentials.every((c, i) => i === 0 || c.remaining >= credentials[i - 1].remaining),
  'credentials are ranked by fewest courses remaining',
)

// --- the headline case: a CS student is already deep into the Certificate in Computing ---
const computing = credentials.find((c) => c.program.id === 'computing-certificate')
assert.ok(computing, 'Certificate in Computing should be matched for a CS student')
assert.ok(
  computing.doneCount > 0,
  'the CS sample transcript already satisfies part of the Certificate in Computing',
)
assert.equal(
  computing.doneCount + computing.remaining,
  computing.totalRequired,
  'done + remaining must account for every required course',
)
assert.ok(
  computing.unsatisfied.every((g) => g.options.every((code) => !completed.has(code))),
  'an outstanding slot never lists a course the student already has',
)

// --- the student's own program is excluded, and included again when it is not their program ---
assert.ok(
  !computeCredentials(programs, completed, statisticsMinor.id).some((c) => c.program.id === statisticsMinor.id),
  'a credential is not offered as an add-on to itself',
)
assert.ok(
  computeCredentials(programs, completed, computerScience.id).some((c) => c.program.id === statisticsMinor.id),
  'the Statistics Minor is offered to a student whose program is Computer Science',
)

// --- degrades, never throws ---
assert.deepEqual(computeCredentials([], completed, undefined), [], 'no programs yields no credentials')
assert.ok(
  computeCredentials(programs, new Set(), undefined).every((c) => c.doneCount === 0),
  'a blank transcript completes nothing',
)

console.log(`check-credentials.ts: all assertions passed (${credentials.length} credentials matched)`)
