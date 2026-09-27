// Sanity check for the term planner. Run: node --experimental-strip-types scripts/check-plan.ts
import assert from 'node:assert/strict'
import { computeMatches } from '../src/lib/match.ts'
import { buildPlan, selectCourses, withPrerequisites, courseLevel, upcomingTerm, buildStudentPlan, termsFrom, isElective } from '../src/lib/plan.ts'
import { computerScienceDegree } from '../src/data/programs/computerScienceDegree.ts'
import { courseInfo } from '../src/data/prereqs.ts'
import { completedCourses } from '../src/data/transcript.ts'
import { specializations } from '../src/data/specializations.ts'

const completed = new Set(completedCourses)
const matches = computeMatches(specializations, completed)

assert.equal(courseLevel('CMPT141'), 1)
assert.equal(courseLevel('CMPT423'), 4)

// --- scraped catalogue data is present and shaped right ---
assert.equal(courseInfo.CMPT280.prerequisiteText, 'CMPT 270', 'CMPT280 prerequisite is CMPT 270, verbatim')
assert.deepEqual(courseInfo.CMPT280.requires, [['CMPT270']])
assert.deepEqual(
  courseInfo.CMPT423.requires,
  [['CMPT317'], ['STAT242', 'STAT245', 'EE216'], ['MATH164']],
  'AND-groups of OR-options parsed from the catalogue line',
)
assert.equal(courseInfo.CMPT141.creditUnits, 3)

// --- selection covers exactly the outstanding requirement, never a completed course ---
for (const match of matches) {
  const picked = selectCourses(match, specializations, completed)
  assert.equal(picked.length, match.remaining, `${match.spec.id}: one pick per outstanding course`)
  assert.ok(
    picked.every((p) => !completed.has(p.code)),
    `${match.spec.id}: never plans a course already taken`,
  )
  assert.equal(new Set(picked.map((p) => p.code)).size, picked.length, `${match.spec.id}: no duplicate picks`)
  assert.ok(
    picked.every((p) => p.reason === 'requirement'),
    `${match.spec.id}: raw selection contains only requirements`,
  )
  assert.ok(
    picked.every((p) => !p.alsoAdvances.includes(match.spec.name)),
    `${match.spec.id}: alsoAdvances excludes the target specialization itself`,
  )
}

// --- choice slots prefer the option that double-dips ---
const infoVis = matches.find((m) => m.spec.id === 'information-visualization')
assert.ok(infoVis, 'information-visualization should exist in the catalogue data')
assert.ok(
  selectCourses(infoVis, specializations, completed).some((p) => p.alsoAdvances.length > 0),
  'at least one planned course should also advance another specialization',
)

// --- prerequisite expansion is additive, deduplicated, and never re-adds a completed course ---
for (const match of matches) {
  const picked = selectCourses(match, specializations, completed)
  const expanded = withPrerequisites(picked, completed)
  assert.ok(expanded.length >= picked.length, `${match.spec.id}: expansion only adds`)
  assert.equal(
    new Set(expanded.map((c) => c.code)).size,
    expanded.length,
    `${match.spec.id}: no duplicate courses after expansion`,
  )
  assert.ok(
    expanded.every((c) => !completed.has(c.code)),
    `${match.spec.id}: never plans a completed course as a prerequisite`,
  )
  for (const course of expanded.filter((c) => c.reason === 'prerequisite')) {
    assert.ok(course.neededBy, `${course.code}: a prerequisite records what needs it`)
    assert.ok(
      expanded.some((c) => c.code === course.neededBy),
      `${course.code}: the course that needs it is in the same plan`,
    )
  }
}

// --- a known hidden prerequisite is surfaced ---
// Machine Learning (CMPT 423) requires MATH 164, which the Machine Learning specialization itself
// never lists. A student reading only the specialization page would not see that cost.
const mlPlan = withPrerequisites(
  [{ code: 'CMPT423', reason: 'requirement', alsoAdvances: [] }],
  new Set<string>(),
)
assert.ok(
  mlPlan.some((c) => c.code === 'MATH164' && c.reason === 'prerequisite'),
  'CMPT423 pulls in MATH164 as a hidden prerequisite',
)
assert.ok(
  mlPlan.some((c) => c.code === 'CMPT317' && c.reason === 'prerequisite'),
  'CMPT423 pulls in CMPT317 as a hidden prerequisite',
)

// --- terms respect prerequisites: nothing lands in or before its prerequisite's term ---
const target = matches.find((m) => m.remaining >= 3)
assert.ok(target, 'sample transcript should leave at least one specialization 3+ courses out')
const plan = buildPlan(target, specializations, completed, 2, { season: 'Fall', year: 2026 })

const termIndex = new Map<string, number>()
plan.forEach((term, i) => term.courses.forEach((c) => termIndex.set(c.code, i)))
for (const [code, index] of termIndex) {
  for (const options of courseInfo[code]?.requires ?? []) {
    const inPlan = options.filter((o) => termIndex.has(o))
    if (options.some((o) => completed.has(o)) || inPlan.length === 0) continue
    assert.ok(
      inPlan.some((o) => termIndex.get(o)! < index),
      `${code} must come after its prerequisite (one of ${options.join(', ')})`,
    )
  }
}

assert.ok(
  plan.every((t) => t.courses.length <= 2),
  'no term exceeds the per-term cap',
)
assert.deepEqual(
  buildPlan(target, specializations, completed, 1, { season: 'Fall', year: 2026 })
    .slice(0, 3)
    .map((t) => t.label),
  ['Fall 2026', 'Winter 2027', 'Fall 2027'],
  'terms alternate Fall then the following Winter',
)

// --- opting out of prerequisites yields exactly the required courses ---
const bare = buildPlan(target, specializations, completed, 2, { season: 'Fall', year: 2026 }, {
  includePrerequisites: false,
})
assert.equal(
  bare.flatMap((t) => t.courses).length,
  target.remaining,
  'without prerequisite expansion, every outstanding course lands in some term and nothing else does',
)

// --- several targets in one plan: shared courses are planned once and counted for both ---
const two = matches.filter((m) => m.remaining > 0).slice(0, 2)
assert.equal(two.length, 2, 'sample transcript should leave at least two specializations outstanding')
const [a, b] = two
const combined = selectCourses(two, specializations, completed)
const aAlone = selectCourses(a, specializations, completed)
const bAlone = selectCourses(b, specializations, completed)

assert.equal(
  new Set(combined.map((c) => c.code)).size,
  combined.length,
  'a course shared by both targets is planned once, not twice',
)
assert.ok(
  combined.length <= aAlone.length + bAlone.length,
  'planning together never costs more than planning separately',
)
// Every slot of every target is still covered: each target needs `remaining` of its own courses.
for (const target of two) {
  const claimable = target.unsatisfied.reduce((sum, slot) => {
    const have = slot.options.filter((o) => combined.some((c) => c.code === o)).length
    return sum + Math.min(slot.need, have)
  }, 0)
  assert.equal(claimable, target.remaining, `${target.spec.id}: every outstanding slot is covered by the joint plan`)
}
assert.ok(
  buildPlan(two, specializations, completed, 2, { season: 'Fall', year: 2026 }).every((t) => t.courses.length <= 2),
  'joint plan still respects the per-term cap',
)
assert.deepEqual(
  selectCourses([a], specializations, completed).map((c) => c.code),
  aAlone.map((c) => c.code),
  'a one-element array plans identically to a bare match',
)

// --- degrades, never throws ---
const done = matches.find((m) => m.remaining === 0)
if (done) assert.deepEqual(buildPlan(done, specializations, completed, 3, { season: 'Fall', year: 2026 }), [])
assert.ok(buildPlan(matches[0], specializations, completed, 0, { season: 'Fall', year: 2026 }).length >= 0)

// --- student plan: in-progress courses are never re-planned, and the start term is honoured ---
{
  const target = matches.find((m) => m.remaining >= 2)!
  const inProgress = selectCourses(target, specializations, completed).slice(0, 1).map((c) => c.code)
  const start = { season: 'Winter', year: 2027 } as const
  const studentPlan = buildStudentPlan([target.spec], specializations, completed, inProgress, 2, start)
  const planned = studentPlan.flatMap((t) => t.courses.map((c) => c.code))
  assert.ok(!planned.includes(inProgress[0]), 'an in-progress course is not planned again')
  assert.equal(studentPlan[0].label, 'Winter 2027', 'plan starts in the chosen term')
  assert.deepEqual(termsFrom(start, 3).map((t) => `${t.season} ${t.year}`), ['Winter 2027', 'Fall 2027', 'Winter 2028'])
  const everything = selectCourses(target, specializations, completed).map((c) => c.code)
  assert.deepEqual(buildStudentPlan([target.spec], specializations, completed, everything, 2, start), [], 'finished by in-progress = no plan')
}

// --- load limits: Fall/Winter take up to coursesPerTerm, Spring/Summer up to its own cap ---
{
  const big = matches.reduce((a, b) => (b.remaining > a.remaining ? b : a))
  const loaded = buildStudentPlan([big.spec], specializations, new Set(), [], 3, { season: 'Fall', year: 2026 }, true, 1)
  assert.ok(loaded.some((t) => t.label.startsWith('Spring/Summer')), 'Spring/Summer terms appear when on')
  for (const term of loaded) {
    const cap = term.label.startsWith('Spring/Summer') ? 1 : 3
    assert.ok(term.courses.length <= cap, `${term.label} holds at most ${cap}`)
  }
  const off = buildStudentPlan([big.spec], specializations, new Set(), [], 3, { season: 'Fall', year: 2026 }, false, 1)
  assert.ok(!off.some((t) => t.label.startsWith('Spring/Summer')), 'no Spring/Summer terms when off')
}

assert.deepEqual(upcomingTerm(new Date('2026-03-01')), { season: 'Fall', year: 2026 })
assert.deepEqual(upcomingTerm(new Date('2026-10-01')), { season: 'Winter', year: 2027 })

// --- degree: a CS plan is the whole B.Sc., its open slots unnamed, and every pick fits the degree ---
{
  const degree = computerScienceDegree
  const start = { season: 'Fall', year: 2026 } as const
  for (const spec of specializations) {
    const plan = buildStudentPlan([spec], specializations, new Set(), [], 5, start, false, 2, degree)
    const courses = plan.flatMap((t) => t.courses)
    const named = courses.filter((c) => !isElective(c.code)).map((c) => c.code)
    // First-year: the plan is exactly the degree's 40 courses (120 cu). Courses no slot uses (a
    // prerequisite the degree doesn't list) take free-elective room first, and only go over it once
    // that room is full.
    const everything = new Set(named)
    const unused = everything.size - computeMatches([degree], everything)[0].doneCount
    const freeRoom = degree.totalCourses - degree.requirements.reduce((n, g) => n + g.need, 0)
    assert.equal(courses.length, degree.totalCourses + Math.max(0, unused - freeRoom), `${spec.id}: a whole degree`)
    // The specialization is finished and every named degree slot is filled, by a course or a slot.
    assert.equal(computeMatches([spec], everything)[0].remaining, 0, `${spec.id}: specialization complete`)
    const degreeLeft = computeMatches([degree], everything)[0].unsatisfied
    assert.ok(degreeLeft.every((g) => g.label), `${spec.id}: only open-choice slots are left for unnamed electives`)
    const unnamed = courses.filter((c) => isElective(c.code)).length
    assert.ok(unnamed >= degreeLeft.reduce((n, g) => n + g.need, 0), `${spec.id}: every open slot has an unnamed elective`)
    assert.equal(new Set(courses.map((c) => c.code)).size, courses.length, `${spec.id}: no course twice`)
  }
  // A done course counts once, even when two slots list it (ENG 111: writing and breadth).
  const once = computeMatches([degree], new Set(['ENG111']))[0]
  assert.equal(once.doneCount, 1, 'one course fills one slot')
}

console.log('check-plan.ts: all assertions passed')
