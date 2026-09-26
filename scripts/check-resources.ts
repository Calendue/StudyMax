// Sanity check for rankByUrgency/daysUntil/urgencyTier/formatCountdown.
// Run: node --experimental-strip-types scripts/check-resources.ts
import assert from 'node:assert/strict'
import { rankByUrgency, daysUntil, urgencyTier, formatCountdown } from '../src/lib/resources.ts'
import type { Resource } from '../src/data/schools/types.ts'

const fixtures: Resource[] = [
  { id: 'c', name: 'Rolling C', whatItIs: 'test', whyRelevant: 'test', deadline: 'Rolling' },
  { id: 'a', name: 'Near A', whatItIs: 'test', whyRelevant: 'test', deadline: 'soon', deadlineDate: '2099-01-05' },
  { id: 'b', name: 'Far B', whatItIs: 'test', whyRelevant: 'test', deadline: 'later', deadlineDate: '2099-06-01' },
  { id: 'd', name: 'Rolling D', whatItIs: 'test', whyRelevant: 'test', deadline: 'Rolling' },
]

const ranked = rankByUrgency(fixtures)
assert.deepEqual(
  ranked.map((r) => r.id),
  ['a', 'b', 'c', 'd'],
  'nearest deadline first, rolling entries last (alphabetical among ties)',
)

// A deadline that has already passed must not outrank a live one — it is closed, not urgent.
const withExpired: Resource[] = [
  { id: 'expired', name: 'Expired', whatItIs: 'test', whyRelevant: 'test', deadline: 'gone', deadlineDate: '2000-01-01' },
  ...fixtures,
]
assert.deepEqual(
  rankByUrgency(withExpired).map((r) => r.id),
  ['a', 'b', 'c', 'd', 'expired'],
  'expired deadlines sort last, behind even rolling entries',
)

assert.equal(daysUntil({ id: 'x', name: 'x', whatItIs: '', whyRelevant: '', deadline: '' }), null, 'no deadlineDate → null')

const past = daysUntil({ id: 'x', name: 'x', whatItIs: '', whyRelevant: '', deadline: '', deadlineDate: '2000-01-01' })
assert.equal(past, null, 'past deadline → null (not shown as still-open)')

const soon = daysUntil(
  { id: 'x', name: 'x', whatItIs: '', whyRelevant: '', deadline: '', deadlineDate: '2099-01-05' },
  new Date('2099-01-01T00:00:00'),
)
assert.equal(soon, 4, 'calendar days between today and the deadline day')

const deadlineDay = { id: 'x', name: 'x', whatItIs: '', whyRelevant: '', deadline: '', deadlineDate: '2099-01-05' }
assert.equal(daysUntil(deadlineDay, new Date('2099-01-05T10:00:00')), 0, 'deadline later today → 0 (closes today)')
assert.equal(daysUntil(deadlineDay, new Date('2099-01-04T23:30:00')), 1, 'deadline tomorrow → 1, whatever the hour')
assert.equal(daysUntil(deadlineDay, new Date('2099-01-06T00:01:00')), null, 'the day after → past')

assert.equal(urgencyTier(0), 'urgent', '0 days → urgent')
assert.equal(urgencyTier(14), 'urgent', '14 days → urgent (boundary)')
assert.equal(urgencyTier(15), 'soon', '15 days → soon (boundary)')
assert.equal(urgencyTier(60), 'soon', '60 days → soon (boundary)')
assert.equal(urgencyTier(61), 'distant', '61 days → distant (boundary)')
assert.equal(urgencyTier(null), 'none', 'no deadline → none')

assert.equal(formatCountdown(0), 'Closes today')
assert.equal(formatCountdown(1), 'Closes tomorrow')
assert.equal(formatCountdown(5), 'Closes in 5 days')
assert.equal(formatCountdown(null), '')

console.log('check-resources.ts: all assertions passed')
