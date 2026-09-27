import type { Degree } from './types.js'
import { breadth } from '../breadth.js'
import { catalogueCourses } from '../courses.js'

// B.Sc. Four-year Computer Science, University Catalogue 2026-27 (effective May 1, 2026 to April 30,
// 2027), in credit units: https://programs.usask.ca/arts-and-science/computer-science/bsc-4-computer-science.php
// College rules (120 cu, 66 at the 200 level or higher, the B.Sc. Quantitative Reasoning list):
// https://programs.usask.ca/arts-and-science/policies.php
// Year tags: the department's 2024/25 advising sheet (dated 2023/08/12),
// https://www.cs.usask.ca/documents/advising/2024-bsc-4y-advising.pdf. The page wins where they differ.
//
// C1 15 + C2 9 + C3 18 + C4 57 = 99 cu in groups; C5 is the rest, 21 cu of electives to 120.
// The page's C3 Business Science is "0 - 3 credit units" (3 cu unless an ECON course was used in C2,
// when those 3 cu move to C5). Here it is always one 3-cu slot, so C3 is 18 and C5 21; the total is
// the same either way, and ECON 111/114 count in either group.
//
// Listed codes the 2026-27 catalogue no longer has are dropped from the open lists (the planner must
// never name one): ANTH 421 and ESL 116 (English writing); ANTH 480 (Indigenous learning); DRAM 101,
// DRAM 121, MUS 125, CLAS 110, CLAS 111, ESL 115, HEB 117, HNDI 114, HNDI 117, PHIL 115 and INTS 110
// (breadth). CMPT 116/117 stay as the page's alternatives to CMPT 141/145, never preferred.

const active = new Set(catalogueCourses.map((c) => c.code))
const listed = (codes: string) => codes.split(/\s+/).filter((code) => code && active.has(code))
const level = (code: string) => Number(code.match(/(\d)\d\d$/)?.[1] ?? 0) * 100

const englishWriting = listed(`
  ANTH302 ANTH306 ANTH310 ANTH421 CMRS110 CMRS111 CPSJ203 ENG110 ENG111 ENG112 ENG113 ENG114 ENG120 ENG210
  ENG211 ENG212 ENG213 ENG394 ESL116 HIST115 HIST125 HIST135 HIST145 HIST155 HIST165 HIST175 HIST185 HIST193
  HIST194 MUS155 PHIL120 PHIL121 PHIL133 PHIL208 PHIL233 POLS236 POLS237 PSY323 PSY355 RLST280
`)

// HIST 257 counts "only if taken in 2022-23 or later"; a transcript here has no dates, so it counts.
const indigenousLearning = listed(`
  ANTH202 ANTH350 ANTH480 DRAM111 ENG242 ENG243 ENG335 ENG338 GEOG465 HIST195 HIST257 HIST266 HIST315 HIST316
  INDG107 LING114 LING253 PLAN445 POLS222
`)

// C2's four panels: Fine Arts, Humanities, Social Science, and Courses with No Program Type.
const breadthPanels = listed(`
  ART110 ART122 ART123 ART124 ART125 ART136 ART141 ART151 ART152 ART161 ARTH120 ARTH121 DRAM101 DRAM108
  DRAM110 DRAM111 DRAM113 DRAM118 DRAM119 DRAM121 MUS101 MUS102 MUS104 MUS111 MUS112 MUS120 MUS121 MUS125
  MUS133 MUS134 MUS155 MUS156 MUS175 MUS184
  ARBC114 ARBC117 CHIN114 CHIN117 CLAS110 CLAS111 CMRS110 CMRS111 CREE101 CREE110 DENE110 ENG110 ENG111
  ENG112 ENG113 ENG114 ENG120 ESL115 ESL116 FREN103 FREN104 FREN106 FREN122 FREN123 FREN125 FREN160 FREN218
  GENS112 GERM114 GERM117 GRK112 GRK113 HEB114 HEB117 HIST115 HIST125 HIST135 HIST145 HIST155 HIST165 HIST175
  HIST185 HIST193 HIST194 HIST195 HNDI114 HNDI117 JPNS114 JPNS117 LATN112 LATN113 LING110 LING113 LING114
  LIT110 LIT111 MUS101 MUS111 MUS112 PHIL110 PHIL115 PHIL120 PHIL121 PHIL133 PHIL140 RLST111 RLST112 RLST113
  SPAN114 SPAN117 UKR114 UKR117
  ANTH111 ANTH112 ANTH116 ECON111 ECON114 GENS112 GEOG130 HLST110 INDG107 LING111 LING112 LING113 LING114
  POLS110 POLS111 POLS112 PSY120 PSY121 SOC111 SOC112
  CPSJ112 CPSJ203 INTS110 INTS111 INTS380
`).filter((code, i, all) => all.indexOf(code) === i)

// "Any senior-level fine arts / humanities / social science course provided that the prerequisite is
// met", by the course's program type (Banner attribute, src/data/breadth.ts), less the page's
// exclusions (CLAS 101/103/104/105/107/203; social-science statistics PSY 233/234, SOC 225/325) and
// the policy page's (MATH 101/102, STAT 244).
const breadthExcluded = new Set(
  'CLAS101 CLAS103 CLAS104 CLAS105 CLAS107 CLAS203 PSY233 PSY234 SOC225 SOC325 MATH101 MATH102 STAT244'.split(' '),
)
const seniorBreadth = (code: string) =>
  level(code) >= 200 &&
  !breadthExcluded.has(code) &&
  (breadth[code] ?? []).some((type) => type === 'HUM' || type === 'SOCS' || type === 'FNAR')

const scienceAreas: Record<string, string[]> = {
  Biology: ['BIOL120', 'BIOL121'],
  Chemistry: ['CHEM112', 'CHEM115', 'CHEM250'],
  'Earth Science': ['GEOG120', 'GEOL121', 'GEOL122'],
  'Physics & Astronomy': ['ASTR113', 'ASTR213', 'PHYS115', 'PHYS117', 'PHYS125'],
}

const coreSenior = ['CMPT317', 'CMPT332', 'CMPT340', 'CMPT353', 'CMPT360', 'CMPT370', 'CMPT381']
const cmptAtLeast = (min: number) => (code: string) =>
  /^CMPT\d{3}$/.test(code) && Number(code.slice(4)) >= min && Number(code.slice(4)) < 500
const upperCme = ['CME332', 'CME341', 'CME342', 'CME433', 'CME435']

export const computerScienceBsc4: Degree = {
  id: 'usask-cmpt-bsc-4',
  name: 'B.Sc. Four-year in Computer Science',
  variant: 'bsc-4',
  totalCu: 120,
  minSeniorCu: 66,
  groups: [
    // C1 College Requirement (15 cu). The sheet tags writing and QR Y1 and leaves Indigenous learning
    // untagged; it goes in Year 1 with the rest of C1.
    { id: 'c1-writing', block: 'C1', label: 'English writing', needCu: 6, courses: englishWriting, open: true, year: 1 },
    {
      id: 'c1-indigenous',
      block: 'C1',
      label: 'Indigenous learning',
      needCu: 3,
      courses: indigenousLearning,
      // "INDG — 200-Level, 300-Level, 400-Level"
      matches: (code) => /^INDG[234]\d\d$/.test(code),
      open: true,
      year: 1,
      // The sheet's Year 1 Winter slot is "Indigenous or breadth": what moves when Year 1 is full.
      flexible: true,
    },
    { id: 'c1-qr', block: 'C1', label: 'Quantitative reasoning', needCu: 6, courses: ['MATH163', 'MATH164'], year: 1 },

    // C2 Breadth Requirement (9 cu), "at least 3 credit units from one of Humanities or Social
    // Sciences". The sheet leaves it untagged and Year 1 is already full, so Year 2.
    {
      id: 'c2-breadth',
      block: 'C2',
      label: 'Breadth elective',
      needCu: 9,
      courses: breadthPanels,
      matches: seniorBreadth,
      open: true,
      year: 2,
      typeMin: { cu: 3, types: ['HUM', 'SOCS'] },
    },

    // C3 Cognate Requirement (18 cu here, 15-18 on the page).
    {
      id: 'c3-science',
      block: 'C3',
      label: 'Junior science',
      needCu: 9,
      courses: Object.values(scienceAreas).flat(),
      oneOf: [['PHYS117', 'PHYS125']],
      areas: { capCu: 6, byArea: scienceAreas },
      open: true,
      // A junior science each Year 1 term; the third is Year 2 Fall's "breadth or science".
      year: 1,
      yearCu: 6,
    },
    {
      id: 'c3-phil',
      block: 'C3',
      label: 'Ethics in computer science',
      needCu: 3,
      courses: ['PHIL232', 'GE449'],
      oneOf: [['PHIL232', 'GE449']],
      prefer: ['PHIL232'],
      year: 2,
    },
    {
      id: 'c3-math',
      block: 'C3',
      label: 'Calculus',
      needCu: 3,
      courses: ['MATH110', 'MATH133', 'MATH176'],
      oneOf: [['MATH110', 'MATH133', 'MATH176']],
      prefer: ['MATH110'],
      year: 1,
    },
    {
      id: 'c3-business',
      block: 'C3',
      label: 'Business or economics',
      needCu: 3,
      courses: ['AREC230', 'COMM101', 'COMM105', 'COMM201', 'COMM203', 'COMM204', 'COMM205', 'COMM210', 'COMM304', 'ECON111', 'ECON114'],
      open: true,
      year: 2,
    },

    // C4 Major Requirement (57 cu).
    ...(
      [
        ['CMPT141', 'CMPT116', 1],
        ['CMPT145', 'CMPT117', 1],
        ['CMPT214', null, 2],
        ['CMPT215', 'CME331', 2],
        ['CMPT263', 'CMPT260', 2],
        ['CMPT270', null, 2],
        ['CMPT280', null, 2],
      ] as const
    ).map(([code, or, year]) => ({
      id: `c4-${code.toLowerCase()}`,
      block: 'C4' as const,
      label: or ? `${code.replace(/(\d)/, ' $1')} (or ${or.replace(/(\d)/, ' $1')})` : code.replace(/(\d)/, ' $1'),
      needCu: 3,
      courses: or ? [code, or] : [code],
      ...(or ? { oneOf: [[code, or]], prefer: [code] } : {}),
      year,
    })),
    { id: 'c4-core-senior', block: 'C4', label: 'Core CMPT', needCu: 18, courses: coreSenior, year: 3 },
    {
      id: 'c4-410',
      block: 'C4',
      label: 'CMPT elective (410 or higher)',
      needCu: 6,
      courses: [],
      // "CMPT courses with number 410 or higher" (400-409 may not be used).
      matches: cmptAtLeast(410),
      open: true,
      year: 3,
    },
    {
      id: 'c4-upper',
      block: 'C4',
      label: 'Senior CMPT elective',
      needCu: 3,
      courses: upperCme,
      // "CMPT — 300-Level, 400-Level" plus CME 332/341/342/433/435.
      matches: cmptAtLeast(300),
      open: true,
      year: 3,
    },
    {
      id: 'c4-stats',
      block: 'C4',
      label: 'Statistics',
      needCu: 3,
      courses: ['STAT242', 'STAT245', 'EE216'],
      oneOf: [['STAT242', 'STAT245', 'EE216']],
      // "STAT 242.3* (recommended)"
      prefer: ['STAT242', 'STAT245'],
      year: 2,
    },
    {
      id: 'c4-math',
      block: 'C4',
      label: 'Math or statistics elective',
      needCu: 6,
      courses: [
        'MATH116', 'MATH134', 'MATH177', 'MATH211', 'MATH223', 'MATH225', 'MATH266', 'MATH276', 'MATH327', 'MATH328',
        'MATH361', 'MATH362', 'MATH364', 'STAT241', 'STAT344', 'STAT345', 'STAT348', 'PHIL243',
      ],
      oneOf: [['MATH116', 'MATH134', 'MATH177']],
      allOf: [['MATH361', 'MATH362']],
      open: true,
      // The sheet leaves the Mathematics List untagged.
      year: 2,
    },
  ],
  subjectCap: {
    cu: 6,
    groups: ['c1-writing', 'c1-indigenous', 'c1-qr', 'c2-breadth', 'c3-science'],
    exception: { cu: 9, groups: ['c1-writing', 'c1-indigenous'] },
  },
  milestones: [
    {
      id: 'cs-major-admission',
      label: 'Apply to the CS major',
      afterCu: 30,
      detail:
        'Apply by May 1 after first year. Seats go by the average of CMPT 141, CMPT 145 and the better of MATH 163/164.',
      source: 'https://programs.usask.ca/arts-and-science/computer-science/index.php',
    },
    {
      id: 'honours-application',
      label: 'Honours application',
      afterCu: 60,
      detail: 'Apply by May 1 with 60 cu and a 70% average, overall and in Computer Science.',
      source: 'https://programs.usask.ca/arts-and-science/computer-science/bsc-honours-computer-science.php',
    },
  ],
  sources: [
    'https://programs.usask.ca/arts-and-science/computer-science/bsc-4-computer-science.php',
    'https://programs.usask.ca/arts-and-science/policies.php',
    'https://www.cs.usask.ca/documents/advising/2024-bsc-4y-advising.pdf',
    'https://programs.usask.ca/arts-and-science/computer-science/index.php',
  ],
}

// B.Sc. Honours Computer Science, University Catalogue 2026-27:
// https://programs.usask.ca/arts-and-science/computer-science/bsc-honours-computer-science.php
// C1-C3 are the Four-year's word for word. C4 (60 cu) adds CMPT 360, 364, 400 and STAT 241, takes 15 cu
// (not 18) of the core, and a Calculus 2 slot instead of the Mathematics List; C5 is 18 cu. Year tags:
// https://www.cs.usask.ca/documents/advising/2024-bsc-hons-advising.pdf (MATH 116 Y1, STAT 241 Y2,
// senior CMPT Y3/4; the thesis goes in Year 4, after admission to Honours at 60 cu).
const shared = computerScienceBsc4.groups.filter((g) => g.block !== 'C4')
const sharedC4 = computerScienceBsc4.groups.filter((g) => /^c4-(cmpt\d|stats)/.test(g.id))
const required = (code: string, year: number, label = code.replace(/(\d)/, ' $1')) => ({
  id: `c4-${code.toLowerCase()}`,
  block: 'C4' as const,
  label,
  needCu: 3,
  courses: [code],
  year,
})

export const computerScienceHonours: Degree = {
  id: 'usask-cmpt-bsc-honours',
  name: 'B.Sc. Honours in Computer Science',
  variant: 'bsc-honours',
  totalCu: 120,
  minSeniorCu: 66,
  groups: [
    ...shared,
    ...sharedC4,
    required('CMPT360', 3),
    required('CMPT364', 3),
    required('CMPT400', 4, 'CMPT 400 (Honours thesis)'),
    required('STAT241', 2),
    {
      id: 'c4-core-senior',
      block: 'C4',
      label: 'Core CMPT',
      needCu: 15,
      courses: coreSenior.filter((code) => code !== 'CMPT360'),
      year: 3,
    },
    {
      id: 'c4-410',
      block: 'C4',
      label: 'CMPT elective (410 or higher)',
      needCu: 6,
      courses: ['CME433', 'CME435'],
      matches: cmptAtLeast(410),
      // The advising sheet: "at most 1 of CME433, 435".
      oneOf: [['CME433', 'CME435']],
      open: true,
      year: 3,
    },
    {
      id: 'c4-calc2',
      block: 'C4',
      label: 'Calculus 2',
      needCu: 3,
      courses: ['MATH116', 'MATH134', 'MATH177'],
      oneOf: [['MATH116', 'MATH134', 'MATH177']],
      prefer: ['MATH116'],
      year: 1,
    },
  ],
  subjectCap: computerScienceBsc4.subjectCap,
  milestones: [
    computerScienceBsc4.milestones![0],
    {
      id: 'honours-application',
      label: 'Honours application',
      afterCu: 60,
      // "Formal admission requires ... Completion of all mandatory 200-level CMPT courses in the C4 Major
      // Requirement ... A Cumulative Weighted Average of at least 70% overall and ... in the Major Average."
      detail:
        'Apply by May 1 with 60 cu, CMPT 214, 215, 260 or 263, 270 and 280 done, and a 70% average, overall and in Computer Science. CMPT 400 needs it.',
      source: 'https://programs.usask.ca/arts-and-science/computer-science/bsc-honours-computer-science.php',
    },
  ],
  sources: [
    'https://programs.usask.ca/arts-and-science/computer-science/bsc-honours-computer-science.php',
    'https://programs.usask.ca/arts-and-science/policies.php',
    'https://www.cs.usask.ca/documents/advising/2024-bsc-hons-advising.pdf',
  ],
}

// B.Sc. Three-year Computer Science, University Catalogue 2026-27:
// https://programs.usask.ca/arts-and-science/computer-science/bsc-3-computer-science.php
// 90 cu, at least 42 at the 200 level or higher (C5: "to complete the requirements for the 90 credit
// unit Three-year program, of which at least 42 must be at the 200-level or higher").
// C1 15 and C2 9 are the Four-year's word for word (the page only recommends PHIL 232 there). C3 is 12:
// the same 9 cu of junior science (6 cu per area) and MATH 110/133/176, with no PHIL 232/GE 449 and no
// Business Science. C4 is 33: the seven intro and 200-level courses, "Choose 9 credit units" of
// "CMPT — 300-Level, 400-Level" with "at most 1 course from CME 332, CME 334, CME 341, CME 342,
// CME 433, CME 435", and STAT 242/245/EE 216. C5 is the rest, 21 cu to 90.
// Year tags: https://www.cs.usask.ca/documents/advising/2024-bsc-3y-advising.pdf (dated 2023/08/08):
// CMPT 141/145 and MATH 110 Y1, the 200-level CMPT and STAT 242 Y2, the 9 cu of CMPT Y3. Its C1, C2
// and junior-science tags don't extract cleanly, so those reuse the Four-year sheet's (C1 Y1, two
// junior sciences in Y1, breadth Y2). The page wins where they differ (the sheet still lists PHIL 232
// and BINF 300; the 2026-27 page doesn't require either).
const threeYearCme = ['CME332', 'CME334', 'CME341', 'CME342', 'CME433', 'CME435'].filter((code) => active.has(code))

export const computerScienceBsc3: Degree = {
  id: 'usask-cmpt-bsc-3',
  name: 'B.Sc. Three-year in Computer Science',
  variant: 'bsc-3',
  totalCu: 90,
  minSeniorCu: 42,
  groups: [
    ...shared.filter((g) => g.id !== 'c3-phil' && g.id !== 'c3-business'),
    ...sharedC4,
    {
      id: 'c4-upper',
      block: 'C4',
      label: 'Senior CMPT elective',
      needCu: 9,
      courses: threeYearCme,
      // "CMPT — 300-Level, 400-Level"; CMPT 400 itself needs Honours standing, which the planner checks.
      matches: cmptAtLeast(300),
      oneOf: [threeYearCme],
      open: true,
      year: 3,
    },
  ],
  subjectCap: computerScienceBsc4.subjectCap,
  milestones: [computerScienceBsc4.milestones![0]],
  sources: [
    'https://programs.usask.ca/arts-and-science/computer-science/bsc-3-computer-science.php',
    'https://programs.usask.ca/arts-and-science/policies.php',
    'https://www.cs.usask.ca/documents/advising/2024-bsc-3y-advising.pdf',
    'https://programs.usask.ca/arts-and-science/computer-science/index.php',
  ],
}

/** The CS B.Sc. variants a student can plan, the Four-year first (the default). */
export const computerScienceDegrees: Degree[] = [computerScienceBsc4, computerScienceHonours, computerScienceBsc3]
