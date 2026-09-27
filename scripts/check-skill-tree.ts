// Sanity check for the Academic Skill Tree's layout. Run: node --experimental-strip-types scripts/check-skill-tree.ts
import assert from 'node:assert/strict'
import { computeCourseOverlap, computeMatches } from '../src/lib/match.ts'
import { computeCredentials } from '../src/lib/credentials.ts'
import { buildStudentPlan, upcomingTerm, type TermStart } from '../src/lib/plan.ts'
import { currentTermOf, layoutSkillTree, pathThrough, treeTargets, type SkillTreeLayout } from '../src/lib/skillTree.ts'
import { programs } from '../src/data/programs/index.ts'
import { computerScience } from '../src/data/programs/computerScience.ts'
import { completedCourses, inProgressCourses } from '../src/data/transcript.ts'

const TODAY = new Date(2026, 8, 26) // a Fall term, as on demo day

function student(completedList: string[], inProgress: string[], today: Date, width: number) {
  const completed = new Set(completedList)
  const specs = computerScience.specializations
  const matches = computeMatches(specs, completed)
  const credentials = computeCredentials(programs, completed, computerScience.id)
  const hero = matches[0]
  const planning = [...specs, ...credentials.map((c) => c.spec)]
  const start: TermStart = upcomingTerm(today)
  const plan = buildStudentPlan([hero.spec], planning, completed, inProgress, 2, start)
  const targets = treeTargets(
    [{ match: hero, kind: 'specialization' }],
    credentials.map((c) => ({ match: c, kind: c.program.kind === 'minor' ? 'minor' : 'certificate' })),
  )
  const top = computeCourseOverlap(specs, completed)[0]?.course ?? null
  const input = { completed, inProgress, plan, currentTerm: currentTermOf(today), targets, bestNext: top, width }
  return { input, plan, targets, layout: layoutSkillTree(input) }
}

function checkLayout(name: string, s: ReturnType<typeof student>) {
  const { layout, input, plan, targets } = s
  const codes = layout.nodes.map((n) => n.code)
  const expected = new Set([...input.completed, ...input.inProgress, ...plan.flatMap((t) => t.courses.map((c) => c.code))])

  // Every completed, in-progress and planned course appears exactly once.
  assert.equal(new Set(codes).size, codes.length, `${name}: a course appears twice`)
  assert.deepEqual([...codes].sort(), [...expected].sort(), `${name}: every course on the tree, and only those`)
  for (const code of input.inProgress) {
    if (!input.completed.has(code)) assert.equal(layout.nodes.find((n) => n.code === code)!.status, 'inProgress', `${name}: ${code} in progress`)
  }

  // No two cards overlap, leaves included.
  const boxes = [...layout.nodes.map((n) => ({ id: n.code, ...n })), ...layout.leaves.map((l) => ({ ...l, id: `leaf:${l.id}` }))]
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]
      const b = boxes[j]
      const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
      assert.ok(!overlap, `${name}: ${a.id} overlaps ${b.id}`)
    }
  }
  for (const b of boxes) assert.ok(b.x >= 0 && b.x + b.w <= layout.width && b.y >= 0 && b.y + b.h <= layout.height, `${name}: ${b.id} on the board`)

  // Every prerequisite trace goes upward (or level), never down.
  const byCode = new Map(layout.nodes.map((n) => [n.code, n]))
  for (const t of layout.traces.filter((t) => t.kind === 'prereq')) {
    const a = byCode.get(t.from!)!
    const b = byCode.get(t.to!)!
    assert.ok(a.y >= b.y + b.h, `${name}: ${t.from} → ${t.to} runs down the board`)
  }
  for (const t of layout.traces) assert.ok(t.d.startsWith('M') && !t.d.includes('NaN'), `${name}: ${t.id} is a drawable path`)

  // Fall nodes sit left of the trunk and Winter nodes right of it.
  const trunkL = layout.trunkX - layout.trunkWidth / 2
  const trunkR = layout.trunkX + layout.trunkWidth / 2
  for (const n of layout.nodes) {
    if (n.lane === 'fall') assert.ok(n.x + n.w <= trunkL, `${name}: ${n.code} (Fall) is left of the trunk`)
    else assert.ok(n.x >= trunkR, `${name}: ${n.code} (Winter) is right of the trunk`)
  }

  // Every target has a leaf, above the trunk.
  for (const t of targets) {
    const leaf = layout.leaves.find((l) => l.id === t.id)
    assert.ok(leaf, `${name}: ${t.name} has a leaf`)
    assert.ok(leaf.y + leaf.h <= layout.trunkTop, `${name}: ${t.name}'s leaf is in the canopy`)
  }

  // Years run bottom to top, and the one beacon is a planned course.
  const years = layout.bands.filter((b) => b.kind === 'year')
  assert.ok(years.every((b, i) => i === 0 || b.year < years[i - 1].year), `${name}: Year 1 is at the bottom`)
  assert.ok(layout.nodes.filter((n) => n.status === 'next').length <= 1, `${name}: at most one beacon`)
}

// ── the sample student, on a phone and a desktop ──
for (const width of [360, 390, 1000]) {
  const s = student(completedCourses, inProgressCourses, TODAY, width)
  checkLayout(`sample@${width}`, s)
  const again = student(completedCourses, inProgressCourses, TODAY, width)
  assert.equal(JSON.stringify(again.layout), JSON.stringify(s.layout), `sample@${width}: deterministic`)
}
const sample = student(completedCourses, inProgressCourses, TODAY, 390).layout
const node = (code: string) => sample.nodes.find((n) => n.code === code)!
assert.equal(node('CMPT141').year, 1)
assert.equal(node('CMPT141').lane, 'fall', 'CMPT 141 sits left of the trunk, as on the whiteboard (its MATH prerequisite can be taken concurrently)')
assert.equal(node('CMPT145').lane, 'winter', 'CMPT 145 needs CMPT 141 in the same year: Winter')
assert.ok(node('CMPT280').year > node('CMPT141').year, 'a 200-level course grows above a 100-level one')
assert.equal(node('CMPT434').status, 'inProgress')
assert.ok(node('CMPT434').y < node('CMPT332').y, 'CMPT 434 (needs CMPT 332) sits above it in the same term')
assert.equal(sample.nodes.filter((n) => n.status === 'next').length, 1, 'the sample student has one best next course')
assert.ok(sample.traces.some((t) => t.kind === 'prereq' && t.state === 'lit'), 'completed chains carry current')
const path = pathThrough(sample, 'CMPT280')
assert.ok(path.codes.has('CMPT270') && path.codes.has('CMPT145'), 'selecting CMPT 280 lights its chain to the roots')

// ── a first-year with nothing done yet: a sapling, the canopy already showing the target ──
const firstYear = student([], [], TODAY, 390)
checkLayout('first-year', firstYear)
assert.ok(firstYear.layout.leaves.length >= 1, 'a first-year still sees their target in the canopy')
assert.ok(firstYear.layout.nodes.every((n) => n.status !== 'completed'))

// ── nothing at all: no targets, no plan ──
const empty = layoutSkillTree({ completed: [], inProgress: [], plan: [], currentTerm: currentTermOf(TODAY), targets: [], width: 390 })
assert.equal(empty.nodes.length, 0)
assert.equal(empty.leaves.length, 0)
assert.ok(empty.height > 0 && empty.bands.some((b) => b.kind === 'roots'))

// ── in Winter, this year's completed courses can only have been in the Fall ──
const winter = student(completedCourses, inProgressCourses, new Date(2027, 1, 10), 390)
checkLayout('winter', winter)
const summary = (l: SkillTreeLayout) =>
  l.bands
    .filter((b) => b.kind === 'year')
    .map((b) => {
      const n = l.nodes.filter((x) => x.year === b.year)
      return `Y${b.year}${b.current ? '*' : ''} ${n.filter((x) => x.lane === 'fall').length}|${n.filter((x) => x.lane === 'winter').length}`
    })
    .join('  ')
console.log(`Skill tree OK. sample: ${sample.nodes.length} courses, ${sample.leaves.length} leaves, ${sample.traces.filter((t) => t.kind === 'prereq').length} prerequisite traces, ${sample.height}px tall. ${summary(sample)}`)
