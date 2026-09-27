// Sanity check for the credit-unit degree model and its audit.
// Run: node --experimental-strip-types --experimental-loader ./scripts/_resolve-ts-loader.mjs scripts/check-degree-model.ts
//
// The numbers come from the 2026-27 page
// (programs.usask.ca/arts-and-science/computer-science/bsc-4-computer-science.php); the sample's
// expected progress was worked out by hand from src/data/transcript.ts.
import assert from 'node:assert/strict'
import { computerScienceBsc4 as degree, computerScienceHonours as honours } from '../src/data/degrees/computerScience.ts'
import { auditDegree, courseCu, groupAccepts, juniorCapOf } from '../src/lib/degree.ts'
import { juniorCaps } from '../src/data/degrees/juniorCaps.ts'
import { breadth } from '../src/data/breadth.ts'
import { catalogueCourses } from '../src/data/courses.ts'
import { completedCourses, inProgressCourses } from '../src/data/transcript.ts'
import { specializations } from '../src/data/specializations.ts'

const group = (id: string) => {
  const g = degree.groups.find((x) => x.id === id)
  assert.ok(g, `${id} exists`)
  return g
}
const progress = (courses: string[], id: string) => auditDegree(degree, courses).groups.find((p) => p.group.id === id)!

// --- the page's arithmetic ---
const blockCu = (block: string) => degree.groups.filter((g) => g.block === block).reduce((n, g) => n + g.needCu, 0)
assert.equal(blockCu('C1'), 15, 'C1 College Requirement (15 credit units)')
assert.equal(blockCu('C2'), 9, 'C2 Breadth Requirement (9 credit units)')
assert.ok(blockCu('C3') >= 15 && blockCu('C3') <= 18, 'C3 Cognate Requirement (15-18 credit units)')
assert.equal(blockCu('C3'), 18, 'business science is always one 3-cu slot here')
assert.equal(blockCu('C4'), 57, 'C4 Major Requirement (57 credit units)')
const c5 = degree.totalCu - degree.groups.reduce((n, g) => n + g.needCu, 0)
assert.ok(c5 >= 21 && c5 <= 24, `C5 Electives Requirement (21-24 credit units), got ${c5}`)
assert.equal(degree.totalCu, 120)
assert.equal(degree.minSeniorCu, 66)
assert.equal(new Set(degree.groups.map((g) => g.id)).size, degree.groups.length, 'group ids are unique')

// --- lists: only active codes in the open lists, and overlaps only where the page lists a course twice ---
const active = new Set(catalogueCourses.map((c) => c.code))
for (const id of ['c1-writing', 'c1-indigenous', 'c2-breadth', 'c3-science', 'c3-business', 'c4-math']) {
  for (const code of group(id).courses) assert.ok(active.has(code), `${id}: ${code} is in the 2026-27 catalogue`)
}
assert.ok(group('c1-writing').courses.includes('RLST280'), 'RLST 280 is on the English writing list')
assert.ok(!group('c1-writing').courses.includes('ANTH421'), 'ANTH 421 is gone from the catalogue')
const pageListsTwice = new Set([
  // English writing and C2 Humanities / Fine Arts / No Program Type
  'CMRS110', 'CMRS111', 'CPSJ203', 'ENG110', 'ENG111', 'ENG112', 'ENG113', 'ENG114', 'ENG120', 'HIST115',
  'HIST125', 'HIST135', 'HIST145', 'HIST155', 'HIST165', 'HIST175', 'HIST185', 'HIST193', 'HIST194', 'MUS155',
  'PHIL120', 'PHIL121', 'PHIL133',
  // Indigenous learning and C2
  'DRAM111', 'HIST195', 'INDG107', 'LING114',
  // C2 Social Science and C3 Business Science
  'ECON111', 'ECON114',
])
const listedIn = new Map<string, string[]>()
for (const g of degree.groups) for (const code of g.courses) listedIn.set(code, [...(listedIn.get(code) ?? []), g.id])
const twice = [...listedIn].filter(([, ids]) => ids.length > 1).map(([code]) => code)
assert.deepEqual(twice.sort(), [...pageListsTwice].sort(), 'only the page\'s own double listings overlap')
const everything = auditDegree(degree, [...pageListsTwice])
for (const code of pageListsTwice) {
  const counted = everything.groups.filter((p) => p.courses.includes(code)).length
  assert.ok(counted <= 1, `${code} counts toward at most one group (got ${counted})`)
  assert.ok(code in everything.assignment, `${code} has an assignment entry`)
}

// --- year tags from the advising sheet ---
for (const id of ['c1-writing', 'c1-indigenous', 'c1-qr', 'c3-science', 'c3-math', 'c4-cmpt141', 'c4-cmpt145']) {
  assert.equal(group(id).year, 1, `${id} is Year 1`)
}
for (const id of ['c4-cmpt214', 'c4-cmpt215', 'c4-cmpt263', 'c4-cmpt270', 'c4-cmpt280', 'c4-stats', 'c3-phil']) {
  assert.equal(group(id).year, 2, `${id} is Year 2`)
}
for (const id of ['c4-core-senior', 'c4-410', 'c4-upper']) assert.equal(group(id).year, 3, `${id} is Year 3`)
assert.deepEqual(group('c4-stats').prefer?.[0], 'STAT242', 'STAT 242 is the recommended statistics course')
assert.deepEqual(group('c4-cmpt263').prefer, ['CMPT263'], 'CMPT 263 beats CMPT 260')
assert.deepEqual(group('c4-cmpt215').prefer, ['CMPT215'], 'CMPT 215 beats CME 331')

// --- credit units ---
assert.equal(courseCu('ENG110'), 6)
assert.equal(courseCu('MATH133'), 4)
assert.equal(courseCu('CMPT141'), 3)
assert.equal(courseCu('XYZ 123.4'), 4, 'the digit after the dot when the catalogue has no entry')
assert.equal(courseCu('XYZ123'), 3)

// --- a first-year with nothing ---
const empty = auditDegree(degree, [])
assert.equal(empty.remainingCu, 120)
assert.equal(empty.remainingSeniorCu, 66)
assert.equal(empty.countedCu, 0)
for (const p of empty.groups) assert.equal(p.remainingCu, p.group.needCu, `${p.group.id} is all outstanding`)
assert.equal(empty.groups.find((p) => p.group.id === 'c2-breadth')!.typeRemainingCu, 3)

// --- the sample student (completed and in progress), checked by hand ---
const sample = auditDegree(degree, [...completedCourses, ...inProgressCourses])
const expected: Record<string, [number, string[]]> = {
  'c1-writing': [6, ['ENG113', 'PHIL133']],
  'c1-indigenous': [0, []], // LING 111 is not on the list (LING 114 is): still 3 cu short
  'c1-qr': [6, ['MATH163', 'MATH164']],
  'c2-breadth': [9, ['ECON111', 'LING111', 'PSY120']], // all Social Science, so the 3-cu minimum is met
  'c3-science': [6, ['ASTR113', 'PHYS115']], // PHYS 117 is a third Physics & Astronomy course: over the 6-cu area cap
  'c3-phil': [3, ['PHIL232']],
  'c3-math': [3, ['MATH110']],
  'c3-business': [3, ['ECON114']],
  'c4-cmpt141': [3, ['CMPT141']],
  'c4-cmpt145': [3, ['CMPT145']],
  'c4-cmpt214': [3, ['CMPT214']],
  'c4-cmpt215': [3, ['CMPT215']],
  'c4-cmpt263': [3, ['CMPT263']],
  'c4-cmpt270': [3, ['CMPT270']],
  'c4-cmpt280': [3, ['CMPT280']],
  'c4-core-senior': [18, ['CMPT317', 'CMPT332', 'CMPT340', 'CMPT353', 'CMPT360', 'CMPT370']],
  'c4-410': [3, ['CMPT434']], // one 410+ course still to go
  'c4-upper': [3, ['CMPT306']],
  'c4-stats': [3, ['STAT245']],
  'c4-math': [6, ['MATH116', 'MATH266']],
}
for (const p of sample.groups) {
  const [cu, courses] = expected[p.group.id]
  assert.equal(p.cu, cu, `sample ${p.group.id}: ${p.cu} cu`)
  assert.deepEqual([...p.courses].sort(), courses, `sample ${p.group.id}: ${p.courses.join(' ')}`)
}
assert.equal(sample.groups.find((p) => p.group.id === 'c2-breadth')!.typeRemainingCu, 0)
const electives = Object.entries(sample.assignment).filter(([, g]) => g === null).map(([c]) => c).sort()
assert.deepEqual(electives, ['MATH238', 'PHYS117', 'STAT241', 'STAT344', 'STAT348'], 'the rest count as C5 electives')
// 35 three-cu courses: 15 junior (45 cu) and 20 senior (60 cu).
assert.equal(sample.countedCu, 105)
assert.equal(sample.seniorCu, 60)
assert.equal(sample.remainingCu, 15)
assert.equal(sample.remainingSeniorCu, 6)
assert.ok(sample.violations.some((v) => v.includes('PHYS 117') && v.includes('Physics & Astronomy')))
// Groups 9 cu short (Indigenous 3, science 3, 410+ 3), C5 21 - 15 = 6: 15 cu in all.
assert.equal(sample.groups.reduce((n, p) => n + p.remainingCu, 0), 9)
// Planned slots finish it: the labels count toward their groups, and the senior ones toward the 66.
const finished = auditDegree(degree, [
  ...completedCourses,
  ...inProgressCourses,
  'elective:0:Indigenous learning',
  'elective:1:Junior science',
  'elective:2:CMPT elective (410 or higher)',
  'elective:3:Senior elective (200-level or higher)',
  'elective:4:Senior elective (200-level or higher)',
])
assert.equal(finished.remainingCu, 0)
assert.equal(finished.remainingSeniorCu, 0)
for (const p of finished.groups) assert.equal(p.remainingCu, 0, `with the slots, ${p.group.id} is met`)
assert.equal(finished.assignment['elective:3:Senior elective (200-level or higher)'], null, 'a free slot is a C5 elective')

// --- single rules ---
assert.equal(progress(['ENG110'], 'c1-writing').cu, 6, 'ENG 110.6 alone fills English writing')
assert.equal(progress(['ENG110'], 'c1-writing').remainingCu, 0)
assert.equal(progress(['MATH116', 'MATH134'], 'c4-math').cu, 3, 'MATH 116 or 134 or 177 counts once')
assert.equal(progress(['MATH361'], 'c4-math').cu, 0, 'MATH 361 counts only with MATH 362')
assert.equal(progress(['MATH361', 'MATH362'], 'c4-math').cu, 6, 'MATH 361 and 362 count together')
assert.equal(progress(['PHYS117', 'PHYS125'], 'c3-science').cu, 3, 'PHYS 117 or 125 counts once')
const oneArea = auditDegree(degree, ['ASTR113', 'ASTR213', 'PHYS115', 'PHYS117'])
assert.equal(oneArea.groups.find((p) => p.group.id === 'c3-science')!.cu, 6, 'at most 6 cu from one science area')
assert.ok(oneArea.violations.length > 0, 'the area cap is explained')
assert.equal(progress(['BIOL120', 'CHEM112', 'PHYS115'], 'c3-science').cu, 9, 'three areas fill junior science')

// A senior Humanities course counts toward C2 by its program type, and toward the HUM/SOCS minimum.
assert.deepEqual(breadth.PHIL234, ['HUM'])
const senior = progress(['PHIL234'], 'c2-breadth')
assert.equal(senior.cu, 3, 'PHIL 234 (senior, HUM) counts toward breadth')
assert.equal(senior.typeRemainingCu, 0)
// A senior Fine Arts course counts toward C2 but not toward the Humanities/Social Science minimum.
assert.ok(breadth.ART217?.includes('FNAR'))
assert.equal(progress(['ART217'], 'c2-breadth').typeRemainingCu, 3)
const fineArtsOnly = auditDegree(degree, ['ART217', 'ART220', 'ART222', 'PHIL234'])
const c2 = fineArtsOnly.groups.find((p) => p.group.id === 'c2-breadth')!
assert.equal(c2.cu, 9)
assert.equal(c2.typeRemainingCu, 0, 'the Humanities course is kept in breadth over a third Fine Arts one')
for (const code of ['CLAS203', 'PSY233', 'PSY234', 'SOC225', 'SOC325', 'STAT244', 'CMPT370']) {
  assert.ok(!groupAccepts(group('c2-breadth'), code), `${code} is not a breadth course`)
}

// No more than 6 cu from one subject in C1, C2 and junior C3; 9 allowed across writing and Indigenous.
const eng = auditDegree(degree, ['ENG111', 'ENG112', 'ENG242'])
assert.equal(eng.assignment.ENG242, 'c1-indigenous', '9 cu of ENG across English writing and Indigenous learning')
const eng2 = auditDegree(degree, ['ENG111', 'ENG112', 'ENG120'])
assert.equal(eng2.assignment.ENG120, null, 'a third ENG course cannot also count toward breadth')
assert.ok(eng2.violations.some((v) => v.includes('ENG 120')))
// Each course counts once: PHIL 232 (HUM) fills the ethics slot, not breadth as well.
const phil = auditDegree(degree, ['PHIL232'])
assert.equal(phil.assignment.PHIL232, 'c3-phil')
assert.equal(phil.groups.find((p) => p.group.id === 'c2-breadth')!.cu, 0)
// Junior credit beyond 54 cu doesn't count toward the 120.
const junior = catalogueCourses.map((c) => c.code).filter((c) => /^(ART|MUS|FREN|LING)1\d\d$/.test(c)).slice(0, 20)
const tooJunior = auditDegree(degree, junior)
assert.equal(tooJunior.countedCu, 54, '20 junior courses count only 54 cu')

// --- maximum junior credit by subject (policies.php, "Maximum Junior Credit Units by Subject") ---
assert.equal(degree.juniorCaps, juniorCaps, 'the Four-year uses the college table')
assert.equal(honours.juniorCaps, juniorCaps, 'so does Honours')
const printed: Record<string, number | null> = {
  CMPT: 12, MATH: 18, STAT: 6, PHYS: 9, CHEM: 9, BIOL: 12, ASTR: 9, GEOL: 8, GEOG: 12, ENG: 6, PHIL: 12, PSY: 6,
  SOC: 6, ECON: 6, HIST: 9, POLS: 9, INDG: 3, LING: 15, ANTH: 9, FREN: 21, CLAS: 18, CTST: 0,
  ART: null, DRAM: null, MUS: null, MUAP: null, INTS: null, INCC: null,
}
for (const [subject, cu] of Object.entries(printed)) assert.equal(juniorCaps[subject]?.cu, cu, `${subject}: ${cu ?? 'unlimited'} junior cu`)
assert.deepEqual(juniorCaps.ENG.extra, ['ENG120'], 'ENG 120.3 may be taken in addition')
for (const [subject, code] of [['BIOL', 'BIOL102'], ['CHEM', 'CHEM142'], ['GEOL', 'GEOL102'], ['PHYS', 'PHYS152']]) {
  assert.deepEqual(juniorCaps[subject].extra, [code], `${code} may be taken in addition`)
}
assert.equal(juniorCapOf(degree, 'ENG120'), null, 'ENG 120 is outside the ENG cap')
assert.equal(juniorCapOf(degree, 'ENG210'), null, 'a senior course is never junior-capped')
assert.equal(juniorCapOf(degree, 'elective:0:Free elective'), null, 'a slot is never junior-capped')
assert.deepEqual(juniorCapOf(degree, 'CMPT 141.3'), { subject: 'CMPT', cu: 12 })

// Four junior ENG courses: only 6 cu count, toward the total and toward any group.
const fourEng = auditDegree(degree, ['ENG111', 'ENG112', 'ENG113', 'ENG114'])
assert.equal(fourEng.countedCu, 6, 'four junior ENG courses count 6 cu')
assert.equal(fourEng.remainingCu, 114)
assert.ok(fourEng.violations.includes('12 cu of 100-level ENG; only 6 count toward the degree.'), fourEng.violations.join(' | '))
const engInGroups = fourEng.groups.flatMap((p) => p.courses).filter((c) => c.startsWith('ENG'))
assert.equal(engInGroups.reduce((n, c) => n + courseCu(c), 0), 6, 'groups count no more junior ENG than the cap')
// ENG 110.6 is 6 cu on its own: another junior ENG course adds nothing.
assert.equal(auditDegree(degree, ['ENG110', 'ENG111']).countedCu, 6)
// ENG 120 may be taken in addition.
const withEng120 = auditDegree(degree, ['ENG111', 'ENG112', 'ENG120'])
assert.equal(withEng120.countedCu, 9, 'ENG 120 counts on top of 6 cu of other junior ENG')
assert.ok(!withEng120.violations.some((v) => v.includes('100-level ENG')), 'ENG 111, 112 and 120 are within the cap')
const pastEng120 = auditDegree(degree, ['ENG111', 'ENG112', 'ENG113', 'ENG120'])
assert.equal(pastEng120.countedCu, 9)
assert.ok(pastEng120.violations.includes('12 cu of 100-level ENG; only 9 count toward the degree.'), pastEng120.violations.join(' | '))
// CMPT: 12 cu; the required CMPT 141 and 145 keep their groups, the rest is what's lost.
const fiveCmpt = auditDegree(degree, ['CMPT140', 'CMPT141', 'CMPT142', 'CMPT145', 'CMPT146'])
assert.equal(fiveCmpt.countedCu, 12, 'five junior CMPT courses count 12 cu')
assert.equal(fiveCmpt.assignment.CMPT141, 'c4-cmpt141')
assert.equal(fiveCmpt.assignment.CMPT145, 'c4-cmpt145')
assert.ok(fiveCmpt.violations.includes('15 cu of 100-level CMPT; only 12 count toward the degree.'))
// A subject with no cap (ART is unlimited; COMM isn't an Arts & Science subject) counts in full.
const fiveArt = auditDegree(degree, ['ART110', 'ART122', 'ART123', 'ART124', 'ART125'])
assert.equal(fiveArt.countedCu, 15, 'five junior ART courses all count')
assert.ok(!fiveArt.violations.some((v) => v.includes('100-level ART')))
assert.equal(auditDegree(degree, ['COMM100', 'COMM101', 'COMM104', 'COMM105', 'COMM111']).countedCu, 15)
// The junior cap comes before the 54-cu junior limit: 15 three-cu ART/DRAM/MUS courses (45 cu,
// unlimited) and four junior ENG (12 cu, 6 count) are 51 cu, not the 54 the limit alone would allow.
const fifteenArts = catalogueCourses
  .map((c) => c.code)
  .filter((c) => /^(ART|DRAM|MUS)1\d\d$/.test(c) && courseCu(c) === 3)
  .slice(0, 15)
assert.equal(fifteenArts.length, 15)
assert.equal(auditDegree(degree, [...fifteenArts, 'ENG111', 'ENG112', 'ENG113', 'ENG114']).countedCu, 51)
// The Arts-to-CS switcher: ENG 113 and 114 count toward nothing, so 102 cu remain, not 96.
const switcher = auditDegree(degree, ['ENG111', 'ENG112', 'ENG113', 'ENG114', 'PSY120', 'PSY121', 'CMPT141', 'MATH110'])
assert.equal(switcher.countedCu, 18)
assert.equal(switcher.remainingCu, 102)
assert.equal(switcher.assignment.ENG113, null)
assert.equal(switcher.assignment.ENG114, null)

// --- specializations: no default target names a course the 2026-27 catalogue lacks ---
const pl = specializations.find((s) => s.id === 'programming-languages')!
assert.ok(!pl.requirements.some((g) => g.courses.includes('CMPT435')), 'CMPT 435 is gone')
assert.ok(specializations.find((s) => s.id === 'computational-modelling')!.unavailable?.includes('BINF 451'))
for (const spec of specializations) {
  if (spec.unavailable) continue
  for (const g of spec.requirements) {
    for (const code of g.courses) assert.ok(active.has(code), `${spec.id}: ${code} is in the 2026-27 catalogue`)
  }
}

// --- Honours: the same C1-C3, a 60-cu C4 (bsc-honours-computer-science.php), 18 cu of C5 ---
const honoursCu = (block: string) => honours.groups.filter((g) => g.block === block).reduce((n, g) => n + g.needCu, 0)
assert.deepEqual([honoursCu('C1'), honoursCu('C2'), honoursCu('C3'), honoursCu('C4')], [15, 9, 18, 60])
assert.equal(honours.totalCu - honours.groups.reduce((n, g) => n + g.needCu, 0), 18, 'C5 Electives (18 - 21 credit units)')
assert.equal(new Set(honours.groups.map((g) => g.id)).size, honours.groups.length, 'Honours group ids are unique')
const honoursSample = auditDegree(honours, [...completedCourses, ...inProgressCourses])
const hp = (id: string) => honoursSample.groups.find((p) => p.group.id === id)!
assert.equal(hp('c4-stat241').cu, 3)
assert.equal(hp('c4-calc2').cu, 3, 'MATH 116 is Calculus 2 here')
assert.equal(hp('c4-cmpt400').remainingCu, 3, 'the thesis is still to come')
assert.equal(hp('c4-core-senior').cu, 15)
assert.equal(auditDegree(honours, ['CME433', 'CME435']).groups.find((p) => p.group.id === 'c4-410')!.cu, 3, 'at most one CME course')

// --- fast enough for renders and the planner loop ---
const all = [...completedCourses, ...inProgressCourses]
const t0 = performance.now()
for (let i = 0; i < 1000; i++) auditDegree(degree, all)
const ms = performance.now() - t0
assert.ok(ms < 1000, `1000 audits of the sample took ${ms.toFixed(0)} ms`)

console.log(`check-degree-model.ts: all assertions passed (1000 sample audits in ${ms.toFixed(0)} ms)`)
