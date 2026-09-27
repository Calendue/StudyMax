// Sanity check for src/lib/max/planningAdapter.ts: that Max's regenerate() builds exactly the plan
// the app's Plan tab does, that the plans respect every hard constraint at the student's own
// preferences, that validate() catches each violation, and the seeded demo student's numbers
// (docs/BayMax/implementation/01-seed-demo-student.md, docs/BayMax/HANDOFF.md).
// Run: node --experimental-strip-types --experimental-loader ./scripts/_resolve-ts-loader.mjs scripts/check-planning-adapter.ts
import assert from 'node:assert/strict'
import { defaultStart, diff, regenerate, validate, speakableCourse, type AdapterInput } from '../src/lib/max/planningAdapter.ts'
import { buildStudentPlan, type PlannedTerm, type Season } from '../src/lib/plan.ts'
import { computeMatches } from '../src/lib/match.ts'
import { computeCredentials } from '../src/lib/credentials.ts'
import { bookedByTerm, seasonNow } from '../src/lib/currentTerms.ts'
import { programs } from '../src/data/programs/index.ts'
import { completedCourses, inProgressCourses, inProgressTerms } from '../src/data/transcript.ts'

const TODAY = new Date(2026, 8, 27) // demo weekend, a Fall term

function student(completed: string[], inProgress: string[], o: Partial<AdapterInput> = {}): AdapterInput {
  const c = new Set(completed)
  const ip = new Set(inProgress)
  return {
    completed: c,
    inProgress: ip,
    targetProgramId: 'computer-science',
    targetSpecializationIds: [],
    minorProgramId: null,
    coursesPerTerm: 5,
    springSummer: false,
    summerPerTerm: 2,
    start: defaultStart(c, ip, TODAY),
    today: TODAY,
    ...o,
  }
}

/** The plan exactly as src/App.tsx builds it (seedOf → hero/extras → targets, planningSpecs, booked, the options), written out independently. */
function appPlan(input: AdapterInput): PlannedTerm[] {
  const program = programs.find((p) => p.id === input.targetProgramId)!
  // App.tsx: activeDegree = the chosen variant, else the program's degree.
  const activeDegree = program.degrees?.find((d) => d.variant === input.degreeVariant) ?? program.degree
  const matches = computeMatches(program.specializations, input.completed, activeDegree)
  const credentials = computeCredentials(programs, input.completed, program.id)
  const planningSpecs = [...program.specializations, ...credentials.map((c) => c.spec)]
  const minorSpecIds = programs.find((p) => p.id === input.minorProgramId)?.specializations.map((s) => s.id) ?? []
  const seed = [...input.targetSpecializationIds, ...minorSpecIds]
  const hero = matches.find((m) => m.spec.id === seed[0]) ?? credentials.find((c) => c.spec.id === seed[0]) ?? matches[0]
  const byId = new Map([...matches, ...credentials].map((m) => [m.spec.id, m]))
  const targets = [hero, ...seed.slice(1).map((id) => byId.get(id)).filter((m) => m !== undefined)].filter((m) => m.remaining > 0)
  const inProgressCourses = [...input.inProgress].filter((c) => !input.completed.has(c))
  // App.tsx currentByTerm: seasons from the one running now, each course in its own (courseTerms).
  const currentSeason = seasonNow(input.today)
  const order: Season[] = ['Fall', 'Winter', 'Spring/Summer']
  const from = order.indexOf(currentSeason)
  const currentByTerm = [...order.slice(from), ...order.slice(0, from)]
    .map((season) => ({ season, courses: inProgressCourses.filter((c) => (input.inProgressSeasons?.[c] ?? currentSeason) === season) }))
    .filter((group) => group.courses.length > 0)
  return buildStudentPlan(targets.map((t) => t.spec), planningSpecs, input.completed, inProgressCourses, input.coursesPerTerm, input.start, {
    springSummer: input.springSummer,
    summerPerTerm: input.summerPerTerm,
    degree: activeDegree,
    booked: bookedByTerm(currentByTerm, input.today),
    away: input.away ?? null,
  })
}

const shape = (terms: PlannedTerm[]) => terms.map((t) => ({ label: t.label, courses: t.courses.map((c) => speakableCourse(c.code)) }))
const half = completedCourses.slice(0, Math.floor(completedCourses.length / 2))

const cases: [string, AdapterInput][] = [
  ['demo student', student(completedCourses, inProgressCourses, { targetSpecializationIds: ['software-development'], start: { season: 'Winter', year: 2027 } })],
  ['nothing taken', student([], [])],
  ['nothing taken, AI concentration', student([], [], { targetSpecializationIds: ['artificial-intelligence'] })],
  ['nothing taken, statistics minor', student([], [], { minorProgramId: 'statistics-minor' })],
  ['half done, 3 a term', student(half, [], { coursesPerTerm: 3 })],
  ['half done, 4 a term', student(half, [], { coursesPerTerm: 4 })],
  ['half done, Spring/Summer', student(half, [], { springSummer: true })],
  ['nothing taken, Spring/Summer at 1', student([], [], { springSummer: true, summerPerTerm: 1 })],
  ['demo, 2 a term', student(completedCourses, inProgressCourses, { coursesPerTerm: 2 })],
  // What the live call sends: the app's own per-course terms, degree variant and internship year.
  ['sample student, per-course terms', student(completedCourses, inProgressCourses, { inProgressSeasons: inProgressTerms })],
  ['half done, Honours', student(half, [], { degreeVariant: 'bsc-honours' })],
  ['half done, Three-year', student(half, [], { degreeVariant: 'bsc-3' })],
  ['half done, internship year 2028', student(half, [], { away: 2028 })],
  ['half done, user-picked target', student(half, [], { targetSpecializationIds: ['cybersecurity', 'algorithmics'] })],
]

for (const [name, input] of cases) {
  const { terms } = regenerate(input)

  // --- parity: the same plan the app draws ---
  assert.deepEqual(terms, appPlan(input), `${name}: regenerate() matches the app's own plan`)
  // --- determinism ---
  assert.deepEqual(terms, regenerate(input).terms, `${name}: deterministic`)
  assert.ok(terms.length > 0, `${name}: a non-empty plan`)

  // --- hard constraints, checked independently of validate() too ---
  for (const t of terms) {
    const cap = t.label.startsWith('Spring/Summer') ? input.summerPerTerm : input.coursesPerTerm
    assert.ok(t.courses.length <= cap, `${name}: ${t.label} holds ${t.courses.length}, over the preference of ${cap}`)
    if (!input.springSummer) assert.ok(!t.label.startsWith('Spring/Summer'), `${name}: no Spring/Summer term when it's off`)
  }
  const planned = terms.flatMap((t) => t.courses.map((c) => c.code)).filter((c) => !c.startsWith('elective:'))
  assert.equal(new Set(planned).size, planned.length, `${name}: no course planned twice`)
  assert.ok(planned.every((c) => !input.completed.has(c)), `${name}: nothing already completed is planned`)

  const v = validate(terms, input)
  assert.equal(v.ok, true, `${name}: validate() ok — ${v.issues.map((i) => i.message).join(' ')}`)
  assert.deepEqual(v.issues.filter((i) => i.severity !== 'INFO'), [], `${name}: no warnings or errors`)
}

// --- a fresh student plans the whole degree (40 courses), not just a specialization ---
const fresh = regenerate(student([], [])).terms
assert.equal(fresh.flatMap((t) => t.courses).length, 40, 'nothing taken: the whole 40-course degree')
assert.deepEqual(fresh[0].label, 'Fall 2027', 'nothing taken: starts the next Fall')
// A lower preference spreads the same degree over more terms.
assert.ok(regenerate(student([], [], { coursesPerTerm: 3 })).terms.length > fresh.length, 'a lower load takes longer')

// --- the demo student's recorded numbers (docs/BayMax/HANDOFF.md) ---
const demo = cases[0][1]
const before = regenerate(demo).terms
assert.deepEqual(shape(before), [
  { label: 'Winter 2027', courses: ['CMPT371', 'CMPT470', 'Indigenous learning', 'Junior science: Biology, Chemistry or Earth Science', 'Free elective'] },
])
assert.ok(inProgressCourses.includes('CMPT370'), 'CMPT370 must actually be in progress for this to test anything')
const droppedInput = { ...demo, inProgress: new Set(inProgressCourses.filter((c) => c !== 'CMPT370')) }
const after = regenerate(droppedInput).terms
// CMPT371 and CMPT470 run only in Winter, so without CMPT370 done they wait a full year.
assert.deepEqual(shape(after), [
  { label: 'Winter 2027', courses: ['CMPT370', 'Indigenous learning', 'Junior science: Biology, Chemistry or Earth Science', 'Free elective'] },
  { label: 'Winter 2028', courses: ['CMPT371', 'CMPT470'] },
])
assert.equal(validate(after, droppedInput).ok, true)

const result = diff(before, after)
assert.equal(result.headline[0], 'Graduation moves from Winter 2027 to Winter 2028.', 'graduation headline is first')
assert.deepEqual(result.graduation, { before: 'Winter 2027', after: 'Winter 2028', changed: true })
assert.deepEqual(result.added, ['CMPT370'])
assert.deepEqual(result.removed, [], 'elective slots never count as removed')
assert.deepEqual(
  result.moved.sort((a, b) => a.code.localeCompare(b.code)),
  [
    { code: 'CMPT371', from: 'Winter 2027', to: 'Winter 2028' },
    { code: 'CMPT470', from: 'Winter 2027', to: 'Winter 2028' },
  ],
)
const noOp = diff(before, before)
assert.deepEqual([noOp.moved, noOp.added, noOp.removed], [[], [], []])
// Nothing changed still answers "what does that do?": graduation first, always (spec 05).
assert.deepEqual(noOp.headline, ['Graduation stays Winter 2027.'])

// --- validate() catches each hard-constraint violation ---
const course = (code: string) => ({ code, reason: 'requirement' as const, alsoAdvances: [] })
const empty = student([], [])
const codes = (terms: PlannedTerm[], input = empty) => validate(terms, input).issues.filter((i) => i.severity === 'ERROR').map((i) => i.code)
assert.deepEqual(codes([{ label: 'Fall 2027', courses: ['CMPT141', 'MATH110', 'ENG110', 'CHEM112', 'BIOL120', 'PHYS115'].map(course) }]), ['OVER_LOAD'])
assert.deepEqual(codes([{ label: 'Winter 2028', courses: [course('CMPT145')] }]), ['PREREQ_UNMET'], 'CMPT145 before CMPT141')
assert.deepEqual(codes([{ label: 'Fall 2027', courses: [course('CMPT371')] }], student(completedCourses.concat('CMPT370'), [])), ['NOT_OFFERED'], 'CMPT371 runs only in Winter')
assert.deepEqual(codes([{ label: 'Fall 2027', courses: [course('CMPT141')] }, { label: 'Winter 2028', courses: [course('CMPT141')] }]), ['DUPLICATE_COURSE'])
// Courses under way count toward the term they're in.
const busy = student([], ['CMPT141', 'MATH110', 'ENG110'], { coursesPerTerm: 4 })
assert.deepEqual(codes([{ label: 'Fall 2026', courses: ['CHEM112', 'BIOL120'].map(course) }], busy), ['OVER_LOAD'], 'booked courses fill their term')
assert.equal(validate([{ label: 'Fall 2027', courses: [course('CMPT141')] }], empty).ok, true)

console.log(`check-planning-adapter.ts: all assertions passed (${cases.length} students, parity with the app's plan, every ERROR code caught)`)
