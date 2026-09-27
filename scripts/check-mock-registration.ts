// Sanity check for the fake registration demo. Run: node --experimental-strip-types scripts/check-mock-registration.ts
import assert from 'node:assert/strict'
import { pickSchedule, sectionsFor, type PlanCourseInput } from '../src/lib/mockRegistration.ts'

const courses: PlanCourseInput[] = [
  { code: 'CMPT370', title: 'Intermediate Software Engineering', credits: 3 },
  { code: 'CMPT371', title: 'Computer Networks and Distributed Processing', credits: 3 },
  { code: 'CMPT383', title: 'Comparative Programming Languages', credits: 3 },
]

// --- deterministic: same input, same output ---
const a = pickSchedule(courses)
const b = pickSchedule(courses)
assert.deepEqual(a, b, 'picking is deterministic for the same input')

// --- no two picked rows clash in time ---
function toMinutes(t: string) {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}
for (let i = 0; i < a.rows.length; i++) {
  for (let j = i + 1; j < a.rows.length; j++) {
    const x = a.rows[i]
    const y = a.rows[j]
    const sameDay = x.days.some((d) => y.days.includes(d))
    const overlap = toMinutes(x.start) < toMinutes(y.end) && toMinutes(y.start) < toMinutes(x.end)
    assert.ok(!(sameDay && overlap), `${x.code} ${x.section} clashes with ${y.code} ${y.section}`)
  }
}

// --- the first course's first section falls back (full) ---
const firstCourseSections = sectionsFor(courses[0].code, false)
const firstRow = a.rows.find((r) => r.code === courses[0].code && r.type === 'Lecture')
assert.ok(firstRow, 'first course got a lecture section')
assert.notEqual(firstRow!.section, firstCourseSections[0].section, 'first course falls back off its full first section')
assert.ok(a.steps.some((s) => s.text.includes('is full')), 'the script records the full-section fallback')

// --- every step targeting a row or course points at a real one ---
for (const step of a.steps) {
  if (step.rowIndex !== undefined) assert.ok(a.rows[step.rowIndex], `step ${step.action} points at a real row`)
  if (step.courseIndex !== undefined) assert.ok(courses[step.courseIndex], `step ${step.action} points at a real course`)
}
assert.ok(a.steps.some((s) => s.action === 'submit'), 'the script ends with a submit step')

// --- electives are excluded (caller's job: this module never invents an elective row) ---
const withElective: PlanCourseInput[] = [...courses, { code: 'elective:3:Breadth elective', title: 'Breadth elective', credits: 3 }]
const c = pickSchedule(withElective.filter((course) => !course.code.startsWith('elective:')))
assert.deepEqual(
  c.rows.map((r) => r.code),
  a.rows.map((r) => r.code),
  'electives filtered out before scheduling produce the same rows',
)

console.log('check-mock-registration: ok')
