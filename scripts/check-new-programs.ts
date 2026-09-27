// Sanity check for the new USask Arts & Science program data. Run:
// node --experimental-strip-types scripts/check-new-programs.ts
import assert from 'node:assert/strict'
import { programs } from '../src/data/programs/index.ts'
import { computeMatches } from '../src/lib/match.ts'

const EXPECTED_NEW_IDS = [
  'applied-mathematics',
  'physics',
  'applied-computing',
  'computing-certificate',
  'mathematical-modelling-certificate',
  'formal-reasoning-certificate',
  'astronomy-certificate',
  'statistics-minor',
]

for (const id of EXPECTED_NEW_IDS) {
  const program = programs.find((p) => p.id === id)
  assert.ok(program, `program "${id}" is registered`)
  assert.ok(program!.specializations.length > 0, `program "${id}" has at least one specialization`)

  for (const spec of program!.specializations) {
    assert.ok(spec.requirements.length > 0, `${id}/${spec.id} has requirements`)

    for (const group of spec.requirements) {
      assert.ok(group.courses.length > 0, `${id}/${spec.id} has no empty course group`)
      assert.ok(
        group.need <= group.courses.length,
        `${id}/${spec.id}: need (${group.need}) never exceeds the group's course count (${group.courses.length})`,
      )
      assert.ok(group.need >= 1, `${id}/${spec.id}: every group needs at least 1 course`)
      for (const code of group.courses) {
        assert.ok(/^[A-Z]+\d+$/.test(code), `${id}/${spec.id}: "${code}" is a valid CODE### course code`)
      }
    }

    // Zero completed courses: nothing satisfied, remaining should equal the full requirement count.
    const empty = computeMatches([spec], new Set()).find((m) => m.spec.id === spec.id)!
    const totalNeed = spec.requirements.reduce((sum, g) => sum + g.need, 0)
    assert.equal(empty.totalRequired, totalNeed, `${id}/${spec.id}: totalRequired matches sum of group needs`)
    assert.equal(empty.doneCount, 0, `${id}/${spec.id}: doneCount is 0 with nothing completed`)
    assert.equal(empty.remaining, totalNeed, `${id}/${spec.id}: remaining equals totalRequired with nothing completed`)

    // A valid minimal solution (first `need` courses of every group) should fully satisfy the specialization —
    // proves the data isn't malformed in a way that makes it unsatisfiable.
    const solution = new Set<string>()
    // A course counts once, so each slot takes courses no earlier slot used.
    for (const group of spec.requirements) {
      for (const code of group.courses.filter((c) => !solution.has(c)).slice(0, group.need)) solution.add(code)
    }
    const solved = computeMatches([spec], solution).find((m) => m.spec.id === spec.id)!
    assert.equal(solved.remaining, 0, `${id}/${spec.id}: a minimal valid solution fully satisfies the specialization`)
  }
}

console.log(`check-new-programs.ts: all assertions passed (${EXPECTED_NEW_IDS.length} programs)`)
