// Sanity check for findSchool. Run: node --experimental-strip-types --experimental-loader ./scripts/_resolve-ts-loader.mjs scripts/check-schools.ts
import assert from 'node:assert/strict'
import { daysUntil } from '../src/lib/resources.ts'
import { findSchool } from '../src/data/schools/index.ts'
import { schools } from '../src/data/schools/index.ts'

assert.equal(findSchool('University of Saskatchewan')?.id, 'usask', 'exact name matches')
assert.equal(findSchool('usask')?.id, 'usask', 'alias matches')
assert.equal(findSchool('U of S')?.id, 'usask', 'alias matches case-insensitively')
assert.equal(findSchool('the university of saskatchewan main campus')?.id, 'usask', 'substring alias match')
assert.equal(findSchool('University of Toronto'), null, 'unmapped school returns null')
assert.equal(findSchool(''), null, 'empty query returns null')
assert.equal(findSchool('   '), null, 'whitespace-only query returns null')

// --- every award links somewhere a student can actually act ---
for (const school of schools) {
  for (const resource of school.resources) {
    assert.ok(
      resource.url.startsWith('https://'),
      `${school.id}/${resource.id}: needs a real https award page, got ${JSON.stringify(resource.url)}`,
    )
    // paws2.usask.ca bounces a signed-out visitor to the PAWS login — from a student reading the
    // card, that link is as dead as a 404.
    assert.ok(
      !resource.url.includes('paws2.usask.ca'),
      `${school.id}/${resource.id}: paws2 links land on the login wall, not the award`,
    )
  }
}

// The finale calls a student about the most urgent award, so at least one real, dated, still-open
// opportunity has to exist — otherwise the call promises a deadline it cannot name.
const today = new Date()
for (const school of schools) {
  const open = school.resources.filter((r) => daysUntil(r, today) !== null)
  assert.ok(
    open.length > 0,
    `${school.id}: every dated deadline has passed — add or refresh one before the call has nothing near to say`,
  )
}

console.log('check-schools.ts: all assertions passed')
