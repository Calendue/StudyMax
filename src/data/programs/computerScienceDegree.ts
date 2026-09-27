import type { Degree } from './types.js'
import type { RequirementGroup } from '../specializations.js'
import { single, subjectAtLevels } from './helpers.js'

// Source: programs.usask.ca/arts-and-science/computer-science/bsc-4-computer-science.php
// (University Catalogue 2026-27, checked 2026-09-27). B.Sc. Four-year, 120 credit units.
//
// Lists are the page's own, minus codes the catalogue no longer offers (ANTH 421, ESL 116, ANTH 480,
// CMPT 116/117, and a dozen breadth courses). Long lists the student picks from freely carry a
// `label`: the plan shows an unnamed slot ("Breadth elective") and still counts one already done.
// Not enforced: "no more than 6 credit units from one subject" (C1-C3), "at least 3 credit units
// from Humanities or Social Sciences" (C2) and "no more than 6 from any one area" (C3). The 66 senior
// credit units in C5 are met by the planner labelling free electives "Senior elective" (minSeniorCu).
// A course counts toward one slot only (see match.ts).
//
// `year` is the 2024/25 advising sheet's year tag for the slot, and the department's template for
// the rest (cs.usask.ca/documents/advising/2024-bsc-4y-advising.pdf; cs.usask.ca/students/
// undergraduate/undergraduate-programs/templates/bsc-four-year.php): C1 and the Year 1 CMPT/MATH in
// Year 1; the 200-level core, STAT 242, PHIL 232, the Mathematics List and business in Year 2; the
// senior CMPT requirements in Year 3. The sheet leaves breadth untagged; the template puts it in
// Years 1-2, and Year 1 is already full, so it is Year 2.

const englishWriting = [
  'ANTH302', 'ANTH306', 'ANTH310', 'CMRS110', 'CMRS111', 'CPSJ203', 'ENG110', 'ENG111', 'ENG112', 'ENG113',
  'ENG114', 'ENG120', 'ENG210', 'ENG211', 'ENG212', 'ENG213', 'ENG394', 'HIST115', 'HIST125', 'HIST135',
  'HIST145', 'HIST155', 'HIST165', 'HIST175', 'HIST185', 'HIST193', 'HIST194', 'MUS155', 'PHIL120', 'PHIL121',
  'PHIL133', 'PHIL208', 'PHIL233', 'POLS236', 'POLS237', 'PSY323', 'PSY355', 'RLST280',
]

const indigenousLearning = [
  'ANTH202', 'ANTH350', 'DRAM111', 'ENG242', 'ENG243', 'ENG335', 'ENG338', 'GEOG465', 'HIST195', 'HIST257',
  'HIST266', 'HIST315', 'HIST316', 'INDG107', 'LING114', 'LING253', 'PLAN445', 'POLS222',
  ...subjectAtLevels('INDG', [200, 300, 400]),
]

// C2's junior lists by code; "any senior-level fine arts, humanities or social science course" also
// counts but can't be listed, so a senior one on a transcript won't show as filling it.
const breadth = [
  'ART110', 'ART122', 'ART123', 'ART124', 'ART125', 'ART136', 'ART141', 'ART151', 'ART152', 'ART161', 'ARTH120',
  'ARTH121', 'DRAM108', 'DRAM110', 'DRAM111', 'DRAM113', 'DRAM118', 'DRAM119', 'MUS101', 'MUS102', 'MUS104',
  'MUS111', 'MUS112', 'MUS120', 'MUS121', 'MUS133', 'MUS134', 'MUS155', 'MUS156', 'MUS175', 'MUS184', 'ARBC114',
  'ARBC117', 'CHIN114', 'CHIN117', 'CMRS110', 'CMRS111', 'CREE101', 'CREE110', 'DENE110', 'ENG110', 'ENG111',
  'ENG112', 'ENG113', 'ENG114', 'ENG120', 'FREN103', 'FREN104', 'FREN106', 'FREN122', 'FREN123', 'FREN125',
  'FREN160', 'FREN218', 'GENS112', 'GERM114', 'GERM117', 'GRK112', 'GRK113', 'HEB114', 'HIST115', 'HIST125',
  'HIST135', 'HIST145', 'HIST155', 'HIST165', 'HIST175', 'HIST185', 'HIST193', 'HIST194', 'HIST195', 'JPNS114',
  'JPNS117', 'LATN112', 'LATN113', 'LING110', 'LING113', 'LING114', 'LIT110', 'LIT111', 'PHIL110', 'PHIL120',
  'PHIL121', 'PHIL133', 'PHIL140', 'RLST111', 'RLST112', 'RLST113', 'SPAN114', 'SPAN117', 'UKR114', 'UKR117',
  'ANTH111', 'ANTH112', 'ANTH116', 'ECON111', 'ECON114', 'GEOG130', 'HLST110', 'INDG107', 'LING111', 'LING112',
  'POLS110', 'POLS111', 'POLS112', 'PSY120', 'PSY121', 'SOC111', 'SOC112', 'CPSJ112', 'CPSJ203', 'INTS111',
  'INTS380',
]

const coreSenior = ['CMPT317', 'CMPT332', 'CMPT340', 'CMPT353', 'CMPT360', 'CMPT370', 'CMPT381']
// "CMPT courses with number 410 or higher" (400-409 don't count).
const cmpt410Plus = subjectAtLevels('CMPT', [400]).filter((code) => Number(code.slice(4)) >= 410)

const juniorScience = ['BIOL120', 'BIOL121', 'CHEM112', 'CHEM115', 'CHEM250', 'GEOG120', 'GEOL121', 'GEOL122', 'ASTR113', 'ASTR213', 'PHYS115', 'PHYS117', 'PHYS125']

const requirements: RequirementGroup[] = [
  // C1 College Requirement (15 cu)
  { courses: englishWriting, need: 2, label: 'English writing', year: 1 },
  { ...single('MATH163'), year: 1 },
  { ...single('MATH164'), year: 1 },
  // C2 Breadth Requirement (9 cu)
  { courses: breadth, need: 3, label: 'Breadth elective', year: 2 },
  // C3 Cognate Requirement (15-18 cu)
  // The advising sheet's Year 1 has a junior science each term; the third goes in Year 2 Fall
  // ("breadth or science").
  { courses: juniorScience, need: 2, label: 'Junior science', year: 1 },
  { courses: juniorScience, need: 1, label: 'Junior science', year: 2 },
  // Indigenous learning is Year 1 too, after the sciences: the sheet's Year 1 Winter slot is
  // "Indigenous or breadth", so it's what moves to Year 2 when a one-term chain needs the seat
  // (Artificial Intelligence's MATH 116 → STAT 241 → STAT 242 → CMPT 317).
  { courses: indigenousLearning, need: 1, label: 'Indigenous learning', year: 1 },
  { courses: ['PHIL232', 'GE449'], need: 1, year: 2 },
  { courses: ['MATH110', 'MATH133', 'MATH176'], need: 1, year: 1 },
  // Business Science: 3 cu from this list, or an Economics course in C2 plus 3 cu more in C5 — the
  // same 3 cu either way, so it's one slot.
  {
    courses: ['AREC230', 'COMM101', 'COMM105', 'COMM201', 'COMM203', 'COMM204', 'COMM205', 'COMM210', 'COMM304', 'ECON111', 'ECON114'],
    need: 1,
    label: 'Business or economics',
    year: 2,
  },
  // C4 Major Requirement (57 cu)
  { ...single('CMPT141'), year: 1 },
  { ...single('CMPT145'), year: 1 },
  { ...single('CMPT214'), year: 2 },
  { courses: ['CMPT215', 'CME331'], need: 1, year: 2 },
  // CMPT 263 replaced CMPT 260: the major map lists 263 in Year 2, and Banner has no CMPT 260
  // section in 2025-27 (students.usask.ca/major-maps/computer-science.php).
  { courses: ['CMPT260', 'CMPT263'], need: 1, year: 2, prefer: ['CMPT263'] },
  { ...single('CMPT270'), year: 2 },
  { ...single('CMPT280'), year: 2 },
  { courses: coreSenior, need: 6, year: 3 },
  { courses: cmpt410Plus, need: 2, label: 'CMPT elective (410 or higher)', year: 3 },
  {
    courses: [...subjectAtLevels('CMPT', [300, 400]), 'CME332', 'CME341', 'CME342', 'CME433', 'CME435'],
    need: 1,
    label: 'Senior CMPT elective',
    year: 3,
  },
  // "STAT 242* (recommended)" on the page.
  { courses: ['STAT242', 'STAT245', 'EE216'], need: 1, year: 2, prefer: ['STAT242'] },
  {
    courses: [
      'MATH116', 'MATH134', 'MATH177', 'MATH211', 'MATH223', 'MATH225', 'MATH266', 'MATH276', 'MATH327', 'MATH328',
      'MATH361', 'MATH362', 'MATH364', 'STAT241', 'STAT344', 'STAT345', 'STAT348', 'PHIL243',
    ],
    need: 2,
    label: 'Math or statistics elective',
    year: 2,
  },
  // C5 Electives Requirement (21-24 cu): whatever brings the degree to 120 cu (totalCourses below).
]

export const computerScienceDegree: Degree = {
  id: 'degree:computer-science-bsc-4',
  name: 'B.Sc. Four-year Computer Science',
  totalCourses: 40,
  minSeniorCu: 66,
  requirements,
}
