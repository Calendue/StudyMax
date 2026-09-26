// Sanity check for the widget snapshot. Run: node --experimental-strip-types scripts/check-widget-snapshot.ts
import assert from 'node:assert/strict'
import { buildWidgetSnapshot, type SnapshotInput } from '../src/lib/widgetSnapshot.ts'
import { daysUntil, rankByUrgency } from '../src/lib/resources.ts'
import { computeCourseOverlap, computeMatches } from '../src/lib/match.ts'
import { completedCourses } from '../src/data/transcript.ts'
import { specializations } from '../src/data/specializations.ts'
import type { Resource } from '../src/data/schools/types.ts'

const award = (id: string, deadlineDate?: string, deadline = deadlineDate ?? 'Rolling / ongoing'): Resource =>
  ({ id, name: `Award ${id}`, whatItIs: 'x', whyRelevant: 'x', deadline, deadlineDate, url: `https://example.com/${id}`, value: id === 'b' ? '$2,000' : undefined }) as Resource

const now = new Date('2026-09-26T12:00:00')
const completed = new Set(completedCourses)
const matches = computeMatches(specializations, completed)
const hero = [...matches].sort((a, b) => a.remaining - b.remaining)[0]

const base: SnapshotInput = {
  revealed: true,
  awards: rankByUrgency([award('rolling'), award('passed', '2026-09-01'), award('b', '2026-10-01'), award('c', '2026-12-01')], now),
  hero,
  heroKind: 'specialization',
  topOverlap: computeCourseOverlap(specializations, completed)[0] ?? null,
  courseTitle: (code) => `Title of ${code}`,
  now,
}

// Nothing before the student has seen their results.
assert.equal(buildWidgetSnapshot({ ...base, revealed: false }), null)

const snap = buildWidgetSnapshot(base)!
assert.ok(snap)
assert.equal(snap.v, 1)

// The soonest dated award still ahead: not the rolling one, not the one that already closed.
assert.equal(snap.deadline?.id, 'b')
assert.equal(snap.deadline?.dueDate, '2026-10-01')
assert.equal(snap.deadline?.value, '$2,000')
assert.equal(daysUntil(award('b', '2026-10-01'), now), 5) // Sep 26 → Oct 1, whatever the hour

// Calendar days, the rule the native widgets and deadline watch mirror.
assert.equal(daysUntil(award('t', '2026-09-26'), now), 0) // today
assert.equal(daysUntil(award('t', '2026-09-27'), now), 1) // tomorrow
assert.equal(daysUntil(award('t', '2026-10-10'), now), 14) // the last urgent day

// Only rolling or passed awards: no deadline, but the credential still shows.
const noDated = buildWidgetSnapshot({ ...base, awards: [award('rolling'), award('passed', '2026-09-01')] })!
assert.equal(noDated.deadline, null)
assert.ok(noDated.credential)

// The credential, with a formatted next course the student hasn't taken.
const cred = snap.credential!
assert.equal(cred.name, hero.spec.name)
assert.equal(cred.left, hero.remaining)
assert.equal(cred.done + cred.left <= cred.total || cred.total > 0, true)
if (hero.remaining > 0) {
  assert.ok(cred.nextCourse, 'an unfinished credential names a next course')
  assert.match(cred.nextCourse!.code, /^[A-Z]+ \d+/)
  assert.ok(!completed.has(cred.nextCourse!.code.replace(' ', '')), 'the next course is not one already done')
  assert.ok(hero.unsatisfied.some((g) => g.options.includes(cred.nextCourse!.code.replace(' ', ''))))
}

// A finished credential has no next course.
const finished = buildWidgetSnapshot({ ...base, hero: { ...hero, remaining: 0, doneCount: hero.totalRequired, unsatisfied: [] } })!
assert.equal(finished.credential!.nextCourse, null)

// Neither half: nothing to show, so the widgets fall back to their empty state.
assert.equal(buildWidgetSnapshot({ ...base, awards: [], hero: null }), null)

// Lock screens are public: exactly these fields and nothing about the student beyond them.
assert.deepEqual(Object.keys(snap).sort(), ['credential', 'deadline', 'updatedAt', 'v'])
assert.deepEqual(Object.keys(snap.deadline!).sort(), ['dueDate', 'id', 'name', 'url', 'value'])
assert.deepEqual(Object.keys(cred).sort(), ['done', 'kind', 'left', 'name', 'nextCourse', 'total'])

console.log('widget snapshot: all checks passed')
