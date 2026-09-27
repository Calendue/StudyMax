// Sanity check for the Academic Skill Tree's layout. Run: node --experimental-strip-types --experimental-loader ./scripts/_resolve-ts-loader.mjs scripts/check-skill-tree.ts
import assert from 'node:assert/strict'
import { computeCourseOverlap, computeMatches } from '../src/lib/match.ts'
import { computeCredentials } from '../src/lib/credentials.ts'
import { buildStudentPlan, isElective, upcomingTerm, type Season, type TermStart } from '../src/lib/plan.ts'
import { bookedByTerm, seasonNow, termLabel } from '../src/lib/currentTerms.ts'
import { currentTermOf, layoutSkillTree, pathThrough, treeTargets, type SkillTreeInput, type SkillTreeLayout, type TreeDegreeProgress } from '../src/lib/skillTree.ts'
import type { Specialization } from '../src/data/specializations.ts'
import { programs } from '../src/data/programs/index.ts'
import { computerScience } from '../src/data/programs/computerScience.ts'
import { completedCourses, inProgressCourses, inProgressTerms } from '../src/data/transcript.ts'

const TODAY = new Date(2026, 8, 26) // a Fall term, as on demo day

interface Options {
  springSummer?: boolean
  /** Courses per Fall/Winter term (the tree's termLoad); 5 unless a test says otherwise. */
  load?: number
  summerLoad?: number
  /** Each in-progress course's season, as the Courses page stores it. Missing: this term. */
  seasons?: Record<string, Season>
  completedTerms?: Record<string, string>
  /** Plan the whole degree (its open slots as elective:<n>:<label> placeholders). */
  wholeDegree?: boolean
  target?: Specialization
  degree?: TreeDegreeProgress
}

function student(completedList: string[], inProgress: string[], today: Date, width: number, o: Options = {}) {
  const completed = new Set(completedList)
  const load = o.load ?? 5
  const summerLoad = o.summerLoad ?? 2
  const specs = computerScience.specializations
  const matches = computeMatches(specs, completed)
  const credentials = computeCredentials(programs, completed, computerScience.id)
  const hero = o.target ? matches.find((m) => m.spec.id === o.target!.id)! : matches[0]
  const planning = [...specs, ...credentials.map((c) => c.spec)]
  const start: TermStart = upcomingTerm(today)
  // The in-progress courses by term, as the app groups them (App.tsx currentByTerm), and the terms
  // they fill in the plan (bookedByTerm) and on the tree (inProgressTerms).
  const seasons: Season[] = ['Fall', 'Winter', 'Spring/Summer']
  const currentByTerm = seasons
    .map((season) => ({ season, courses: inProgress.filter((c) => !completed.has(c) && (o.seasons?.[c] ?? seasonNow(today)) === season) }))
    .filter((group) => group.courses.length > 0)
  const booked = bookedByTerm(currentByTerm, today)
  const terms = Object.fromEntries(currentByTerm.flatMap((g) => g.courses.map((c) => [c, termLabel(g.season, today)])))
  const plan = buildStudentPlan(
    [hero.spec],
    planning,
    completed,
    inProgress,
    load,
    start,
    { springSummer: o.springSummer ?? false, summerPerTerm: summerLoad, degree: o.wholeDegree ? computerScience.degree : undefined, booked },
  )
  const targets = treeTargets(
    [{ match: hero, kind: 'specialization' }],
    credentials.map((c) => ({ match: c, kind: c.program.kind === 'minor' ? 'minor' : 'certificate' })),
  )
  const top = computeCourseOverlap(specs, completed)[0]?.course ?? null
  const input = {
    completed,
    inProgress,
    plan,
    currentTerm: currentTermOf(today),
    inProgressTerms: terms,
    completedTerms: o.completedTerms,
    termLoad: load,
    summerLoad,
    degree: o.degree,
    targets,
    bestNext: top,
    width,
  } satisfies SkillTreeInput
  return { input, plan, targets, layout: layoutSkillTree(input) }
}

/** No lane holds more than its load: a Fall or Winter lane its termLoad, a Spring/Summer lane its summerLoad. */
function checkLoads(name: string, layout: SkillTreeLayout) {
  const lanes = new Map<string, number>()
  for (const n of layout.nodes) lanes.set(`Y${n.year} ${n.lane}`, (lanes.get(`Y${n.year} ${n.lane}`) ?? 0) + 1)
  for (const [lane, count] of lanes) {
    const cap = lane.endsWith('summer') ? layout.summerLoad : layout.termLoad
    assert.ok(count <= cap, `${name}: ${lane} holds ${count} cards, over its load of ${cap}`)
  }
  // A dated card's lane is its season, and its year follows its term.
  const byTerm = new Map<string, number>()
  for (const n of layout.nodes.filter((x) => x.termKnown)) {
    const season = n.term.split(' ')[0]
    assert.equal(n.lane, season === 'Fall' ? 'fall' : season === 'Winter' ? 'winter' : 'summer', `${name}: ${n.code} (${n.term}) is in its season's lane`)
    byTerm.set(n.term, (byTerm.get(n.term) ?? 0) + 1)
  }
  for (const [term, count] of byTerm) {
    assert.ok(count <= (term.startsWith('Spring') ? layout.summerLoad : layout.termLoad), `${name}: ${term} holds ${count}`)
  }
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
  const boxes = [
    ...layout.nodes.map((n) => ({ id: n.code, ...n })),
    ...layout.leaves.map((l) => ({ ...l, id: `leaf:${l.id}` })),
    ...(layout.degree ? [{ id: 'degree readout', ...layout.degree }] : []),
  ]
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]
      const b = boxes[j]
      const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
      assert.ok(!overlap, `${name}: ${a.id} overlaps ${b.id}`)
    }
  }
  for (const b of boxes) assert.ok(b.x >= 0 && b.x + b.w <= layout.width && b.y >= 0 && b.y + b.h <= layout.height, `${name}: ${b.id} on the board`)

  // Every prerequisite link goes upward, or across the trunk from Fall to the same year's Winter side.
  const byCode = new Map(layout.nodes.map((n) => [n.code, n]))
  for (const l of layout.links) {
    const a = byCode.get(l.from)!
    const b = byCode.get(l.to)!
    const across = a.year === b.year && a.lane === 'fall' && b.lane === 'winter'
    assert.ok(a.y >= b.y + b.h || across, `${name}: ${l.from} → ${l.to} runs down the tree`)
  }
  const paths = [layout.trunk, layout.trunkLine, ...layout.links.flatMap((l) => [l.d, l.arrow]), ...layout.twigs.map((t) => t.d), ...layout.branches.map((b) => b.d), ...layout.roots.map((r) => r.d)]
  for (const d of paths) assert.ok(d.startsWith('M') && !d.includes('NaN') && !d.includes('undefined'), `${name}: a drawable path`)
  assert.equal(layout.twigs.length, layout.nodes.length, `${name}: every course hangs on a twig`)
  assert.equal(layout.branches.length, layout.leaves.length, `${name}: every leaf has a branch`)

  // Fall nodes sit left of the trunk; Winter and Spring/Summer nodes right of it, Spring/Summer above
  // every Fall and Winter card of its year (it's the year's last term).
  const trunkL = layout.trunkX - layout.trunkWidth / 2
  const trunkR = layout.trunkX + layout.trunkWidth / 2
  for (const n of layout.nodes) {
    if (n.lane === 'fall') assert.ok(n.x + n.w <= trunkL, `${name}: ${n.code} (Fall) is left of the trunk`)
    else assert.ok(n.x >= trunkR, `${name}: ${n.code} (${n.lane}) is right of the trunk`)
    if (n.lane === 'summer') {
      for (const o of layout.nodes.filter((x) => x.year === n.year && x.lane !== 'summer')) {
        assert.ok(n.y + n.h < o.y, `${name}: ${n.code} (Spring/Summer) sits above ${o.code}`)
      }
    }
  }
  checkLoads(name, layout)
  // Every planned course, electives included, has its own card.
  for (const code of plan.flatMap((t) => t.courses.map((c) => c.code))) assert.ok(byCode.has(code), `${name}: ${code} is on the tree`)

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

// ── the sample student, on a phone and a desktop, each registered course in its own term ──
const SAMPLE: Options = { seasons: inProgressTerms }
for (const width of [360, 390, 600, 880, 1000, 1440]) {
  const s = student(completedCourses, inProgressCourses, TODAY, width, SAMPLE)
  checkLayout(`sample@${width}`, s)
  const again = student(completedCourses, inProgressCourses, TODAY, width, SAMPLE)
  assert.equal(JSON.stringify(again.layout), JSON.stringify(s.layout), `sample@${width}: deterministic`)
}
const sampleRun = student(completedCourses, inProgressCourses, TODAY, 390, SAMPLE)
const sample = sampleRun.layout
const node = (code: string) => sample.nodes.find((n) => n.code === code)!
assert.equal(node('CMPT141').year, 1)
assert.equal(node('CMPT141').lane, 'fall', 'CMPT 141 sits left of the trunk, as on the whiteboard (its MATH prerequisite can be taken concurrently)')
assert.equal(node('CMPT145').lane, 'winter', 'CMPT 145 needs CMPT 141 in the same year: Winter')
assert.ok(sample.links.some((l) => l.from === 'CMPT141' && l.to === 'CMPT145'), 'CMPT 141 links across the trunk to CMPT 145')
assert.ok(node('CMPT145').row <= node('CMPT141').row, 'a Fall prerequisite no longer lifts its Winter course a row')
assert.ok(node('CMPT280').year > node('CMPT141').year, 'a 200-level course grows above a 100-level one')
assert.equal(node('CMPT434').status, 'inProgress')
assert.equal(sample.nodes.filter((n) => n.status === 'next').length, 1, 'the sample student has one best next course')
assert.ok(sample.links.some((l) => l.from === 'CMPT270' && l.to === 'CMPT280'), 'CMPT 270 links up to CMPT 280')
const path = pathThrough(sample, 'CMPT280')
assert.ok(path.codes.has('CMPT270') && path.codes.has('CMPT145'), 'selecting CMPT 280 lights its chain to the roots')
// Each registered course in its own term: three in Winter 2027, four in Fall 2026, "Now" only for Fall.
for (const code of ['CMPT340', 'CMPT353', 'CMPT434']) {
  const n = node(code)
  assert.ok(n.term === 'Winter 2027' && n.lane === 'winter' && !n.current, `${code} is registered for Winter 2027, not taken now: ${n.term} ${n.lane}`)
}
for (const code of ['CMPT332', 'CMPT360', 'CMPT370', 'MATH266']) {
  const n = node(code)
  assert.ok(n.term === 'Fall 2026' && n.lane === 'fall' && n.current, `${code} is taken now, Fall 2026: ${n.term} ${n.lane}`)
}
assert.ok(node('CMPT434').y < node('CMPT332').y, 'CMPT 434 (needs CMPT 332) grows above it')
// A final-year student is in Year 4 (84 cu done), not a Year 5 the level guess invented.
assert.equal(sample.currentYear, 4, 'the sample student is in Year 4')
const plannedYears = sample.nodes.filter((n) => n.status !== 'completed' && n.status !== 'inProgress').map((n) => n.year)
assert.equal(Math.max(...sample.bands.map((b) => b.year)), Math.max(4, ...plannedYears), 'no year band past the plan')
// Undated completed courses: only in years already over, never more than a full load a lane.
assert.ok(sample.nodes.filter((n) => n.status === 'completed').every((n) => n.year < sample.currentYear && !n.termKnown))

// ── the same student at 2 a term (the app's old default): the lanes hold 2, a finished term still holds 5 ──
const slow = student(completedCourses, inProgressCourses, TODAY, 390, { ...SAMPLE, load: 2 })
const slowLanes = new Map<string, number>()
for (const n of slow.layout.nodes.filter((x) => x.status !== 'completed' && x.term !== 'Fall 2026' && x.term !== 'Winter 2027')) {
  slowLanes.set(`${n.year}${n.lane}`, (slowLanes.get(`${n.year}${n.lane}`) ?? 0) + 1)
}
assert.ok([...slowLanes.values()].every((c) => c <= 2), 'at 2 a term, no planned lane holds more than 2')
assert.equal(slow.layout.currentYear, 4, 'a part-time plan does not make the finished years part-time')

// ── dated completed courses go in their own term ──
const dated = student(completedCourses, inProgressCourses, TODAY, 390, {
  ...SAMPLE,
  completedTerms: { CMPT141: 'Fall 2023', CMPT145: 'Winter 2024', MATH110: 'Fall 2023', CMPT317: 'Winter 2026' },
})
checkLayout('dated', dated)
const datedNode = (code: string) => dated.layout.nodes.find((n) => n.code === code)!
assert.ok(datedNode('CMPT141').termKnown && datedNode('CMPT141').term === 'Fall 2023' && datedNode('CMPT141').year === 1 && datedNode('CMPT141').lane === 'fall')
assert.ok(datedNode('CMPT145').term === 'Winter 2024' && datedNode('CMPT145').year === 1 && datedNode('CMPT145').lane === 'winter')
assert.ok(datedNode('CMPT317').term === 'Winter 2026' && datedNode('CMPT317').year === 3 && datedNode('CMPT317').lane === 'winter')

// ── a first-year with nothing done yet: a sapling, the canopy already showing the target ──
const firstYear = student([], [], TODAY, 390)
checkLayout('first-year', firstYear)
assert.ok(firstYear.layout.leaves.length >= 1, 'a first-year still sees their target in the canopy')
assert.ok(firstYear.layout.nodes.every((n) => n.status !== 'completed'))
assert.equal(firstYear.layout.currentYear, 1)

// ── a student who hasn't started yet: Year 1 is the plan's first year, not the calendar's ──
const incoming = layoutSkillTree({
  completed: [],
  inProgress: [],
  plan: [
    { label: 'Fall 2027', courses: [{ code: 'CMPT141', reason: 'requirement', alsoAdvances: [] }] },
    { label: 'Winter 2028', courses: [{ code: 'CMPT145', reason: 'requirement', alsoAdvances: [] }] },
  ],
  currentTerm: currentTermOf(TODAY),
  targets: [],
  width: 390,
})
assert.ok(incoming.nodes.every((n) => n.year === 1), 'a plan from Fall 2027 starts in Year 1')
assert.ok(incoming.bands.every((b) => !b.current), 'no year is "now" before the first term')
assert.ok(incoming.bands.find((b) => b.year === 1)!.heads.some((h) => h.label === 'Fall 2027'))

// ── Spring/Summer: its own lane at the top of its year, on the Winter side, within its cap ──
for (const summerLoad of [1, 2, 3]) {
  const summer = student([], [], TODAY, 390, { springSummer: true, summerLoad, wholeDegree: true })
  checkLayout(`spring-summer@${summerLoad}`, summer)
  const summerNodes = summer.layout.nodes.filter((n) => n.term.startsWith('Spring/Summer'))
  assert.ok(summerNodes.length > 0 && summerNodes.every((n) => n.lane === 'summer'), 'a Spring/Summer course keeps its term and its own lane')
  const band = summer.layout.bands.find((b) => b.year === summerNodes[0].year)!
  assert.ok(band.heads.some((h) => h.lane === 'summer' && h.label.startsWith('Spring/Summer')), 'the Spring/Summer rows have their own head')
}
for (const width of [390, 1000]) checkLayout(`sample-summer@${width}`, student(completedCourses, inProgressCourses, TODAY, width, { ...SAMPLE, springSummer: true, wholeDegree: true }))

// ── the archetypes, for every CS specialization: every planned slot on the tree, no lane over its load ──
const bFirstTerm = ['CMPT141', 'MATH110', 'MATH163', 'ENG111', 'BIOL120']
const cMidDegree = ['CMPT141', 'CMPT145', 'MATH110', 'MATH163', 'MATH164', 'ENG111', 'BIOL120', 'CHEM112', 'PHIL140', 'INDG107', 'CMPT214', 'CMPT215', 'CMPT263', 'CMPT270', 'STAT242']
for (const spec of computerScience.specializations) {
  for (const width of [390, 1000]) {
    const a = student([], [], TODAY, width, { target: spec, wholeDegree: true })
    checkLayout(`A ${spec.id}@${width}`, a)
    const b = student([], bFirstTerm, TODAY, width, { target: spec, wholeDegree: true })
    checkLayout(`B ${spec.id}@${width}`, b)
    assert.ok(b.layout.nodes.filter((n) => bFirstTerm.includes(n.code)).every((n) => n.term === 'Fall 2026' && n.current && n.year === 1), `B ${spec.id}: first term now, Year 1`)
    const c = student(cMidDegree, [], TODAY, width, { target: spec, wholeDegree: true })
    checkLayout(`C ${spec.id}@${width}`, c)
    assert.ok(c.plan.flatMap((t) => t.courses).some((x) => isElective(x.code)), `C ${spec.id}: the whole degree has elective slots`)
  }
}

// ── the degree: a readout in the canopy, milestones on the trunk, the requirement each course fills ──
const DEGREE: TreeDegreeProgress = {
  name: 'B.Sc. Four-year (Computer Science)',
  doneCu: 84,
  inProgressCu: 21,
  plannedCu: 15,
  totalCu: 120,
  blocks: [
    { id: 'C1', label: 'Breadth and writing', needCu: 12, doneCu: 12, plannedCu: 0 },
    { id: 'C2', label: 'Humanities and social science', needCu: 12, doneCu: 9, plannedCu: 3 },
    { id: 'C3', label: 'Science', needCu: 18, doneCu: 12, plannedCu: 6 },
    { id: 'C4', label: 'Major', needCu: 60, doneCu: 39, plannedCu: 21 },
    { id: 'C5', label: 'Electives', needCu: 18, doneCu: 12, plannedCu: 0 },
  ],
  milestones: [
    { id: 'major', label: 'Admission to the major', afterCu: 30, detail: 'Apply to the CS major after 30 credit units.' },
    { id: 'honours', label: 'Honours application', afterCu: 60, detail: 'Apply for Honours after 60 credit units.' },
  ],
  countsToward: { CMPT280: 'C4 Major: Senior core', ENG113: 'C1 English writing' },
}
for (const width of [360, 390, 1000, 1440]) {
  const withDegree = student(completedCourses, inProgressCourses, TODAY, width, { ...SAMPLE, degree: DEGREE })
  checkLayout(`degree@${width}`, withDegree)
  const l = withDegree.layout
  assert.ok(l.degree && l.degree.y + l.degree.h <= Math.min(...l.leaves.map((x) => x.y)), `degree@${width}: the readout sits above the leaves`)
  const band = (year: number) => l.bands.find((b) => b.year === year && b.kind === 'year')!
  assert.equal(l.milestones.find((m) => m.id === 'major')!.y, band(1).y, `degree@${width}: 30 cu is the line between Year 1 and Year 2`)
  assert.equal(l.milestones.find((m) => m.id === 'honours')!.y, band(2).y, `degree@${width}: 60 cu is the line between Year 2 and Year 3`)
  assert.ok(l.milestones.every((m) => m.reached), `degree@${width}: both already passed at 84 cu`)
  assert.equal(l.nodes.find((n) => n.code === 'CMPT280')!.degreeGroup, 'C4 Major: Senior core')
}

// ── nothing at all: no targets, no plan ──
const empty = layoutSkillTree({ completed: [], inProgress: [], plan: [], currentTerm: currentTermOf(TODAY), targets: [], width: 390 })
assert.equal(empty.nodes.length, 0)
assert.equal(empty.leaves.length, 0)
assert.ok(empty.height > 0 && empty.bands.some((b) => b.kind === 'roots'))

// ── in Winter, this year's completed courses can only have been in the Fall ──
const winter = student(completedCourses, inProgressCourses, new Date(2027, 1, 10), 390, SAMPLE)
checkLayout('winter', winter)
const summary = (l: SkillTreeLayout) =>
  l.bands
    .filter((b) => b.kind === 'year')
    .map((b) => {
      const n = l.nodes.filter((x) => x.year === b.year)
      const summer = n.filter((x) => x.lane === 'summer').length
      return `Y${b.year}${b.current ? '*' : ''} ${n.filter((x) => x.lane === 'fall').length}|${n.filter((x) => x.lane === 'winter').length}${summer ? `+${summer}` : ''}`
    })
    .join('  ')
console.log(`Skill tree OK. sample: ${sample.nodes.length} courses, ${sample.leaves.length} leaves, ${sample.links.length} prerequisite links, ${sample.height}px tall. ${summary(sample)}`)
