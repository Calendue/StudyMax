import type { Program } from './types.js'
import type { RequirementGroup, Specialization } from '../specializations.js'
import { single } from './helpers.js'

// Sources (University Catalogue 2026-27, checked 2026-09-26):
// - programs.usask.ca/engineering/first-year/index.php (common first year)
// - programs.usask.ca/engineering/civil-engineering/index.php
// - programs.usask.ca/engineering/electrical-engineering/index.php
// - programs.usask.ca/engineering/mechanical-engineering/be-mechanical-engineering.php
//
// Each specialization is the whole B.E., first year included, so the matcher compares like with
// like: a first-year student sees which discipline their courses already lean toward.
//
// Left out on purpose: Humanities/Social Science and Complementary Studies electives whose lists
// are open-ended ("HIST — 200-Level, 300-Level, 400-Level"). They'd need every course in ~20
// subjects and would swamp the plan with filler. Enumerated elective lists are kept, with `need`
// = credit units ÷ 3.

// Listed on the program page but no longer in the catalogue (catalogue.usask.ca, 2026-09-26), so
// left out of the option lists: ARCH112, ARCH116, CLAS110, CLAS111, HIST110, HIST111, HIST121, HIST122, ME461, ME463, ME472, ME494.
const commonFirstYear: RequirementGroup[] = [
  // Fall
  ...['GE102', 'GE112', 'GE122', 'GE132', 'GE140', 'GE152', 'GE172', 'CMPT142', 'MATH133'].map(single),
  // Natural Science Series
  ...['PHYS152', 'CHEM142', 'GEOL102', 'BIOL102'].map(single),
  // Winter
  ...['GE103', 'GE123', 'GE133', 'CHEM146', 'MATH134', 'PHYS156'].map(single),
]

const scienceElectives = [
  'ASTR213', 'ASTR214', 'BIOL120', 'CHEM221', 'CHEM231', 'CHEM242', 'CHEM250', 'EVSC203', 'EVSC210',
  'GEOG120', 'GEOL224', 'GEOL245', 'GEOL300',
]

const civil: Specialization = {
  id: 'civil-engineering',
  name: 'Civil Engineering',
  requirements: [
    ...commonFirstYear,
    // Civil skips GE 143; its first-year design course and bridge course are GE 183 and CE 171.
    single('GE183'),
    single('CE171'),
    // Year 2
    ...['CE202', 'CE213', 'GE210', 'GEOL121', 'MATH223', 'CE212', 'CE217', 'CE225', 'GEOE218', 'MATH224', 'RCM200'].map(single),
    { courses: [...scienceElectives, 'PHYS223'], need: 1 },
    // Year 3
    ...['CE315', 'CE318', 'CE320', 'CE328', 'CE329', 'GE348', 'CE319', 'CE321', 'CE327', 'CE330', 'CE395'].map(single),
    // Year 4
    ...['CE415', 'CE417', 'CE418', 'CE466', 'GE449', 'CE495', 'CE470'].map(single),
    // "3 cu CE Elective" + "3 cu CE or Related CE Elective", merged: one group so a CE elective can't
    // count twice. Doesn't enforce that at least one of the two is from the CE list.
    { courses: ['CE421', 'CE467', 'CE468', 'CE474', 'ENVE414', 'GEOE375', 'ENVE381', 'GE496', 'GEOE315', 'ME478'], need: 2 },
  ],
}

const mechanical: Specialization = {
  id: 'mechanical-engineering',
  name: 'Mechanical Engineering',
  requirements: [
    ...commonFirstYear,
    single('GE143'),
    // Mechanical may take either first-year design course.
    { courses: ['GE153', 'GE163'], need: 1 },
    single('ME113'),
    // Year 2
    ...['GE210', 'MATH223', 'ME214', 'ME227', 'MATH224', 'ME215', 'ME229', 'RCM200', 'GE213', 'ME226'].map(single),
    { courses: [...scienceElectives, 'GEOL121'], need: 1 },
    {
      // Junior Humanities or Social Science Elective — fully enumerated on this page.
      courses: [
        'ANTH111', 'CLAS104', 'CMRS110', 'CMRS111', 'ECON111', 'ECON114',
        'GEOG130', 'HIST115', 'HIST125', 'HIST135', 'HIST145', 'HIST155',
        'HIST165', 'HIST175', 'INDG107', 'LING111', 'LING112', 'PHIL120', 'PHIL133', 'PHIL140', 'POLS111', 'POLS112',
        'PSY120', 'PSY121', 'SOC111', 'SOC112', 'WGST112',
      ],
      need: 1,
    },
    // Year 3
    ...['ME313', 'ME321', 'ME324', 'ME330', 'ME323', 'ME328', 'ME329', 'ME335', 'ME352', 'GE348', 'ME314', 'ME327'].map(single),
    // Year 4
    ...['ME417', 'ME418', 'ME431', 'GE449'].map(single),
    { courses: ['ME495', 'GE495'], need: 1 },
    {
      // 12 cu Technical Electives. The page also allows "approved senior course(s) from science or
      // Engineering", which can't be enumerated; those won't show as counting here.
      courses: [
        'EE471', 'GEOE377', 'GEOE466', 'GE496', 'CHE453', 'CHE464', 'EP440', 'GEOE380',
        'ME450', 'ME452', 'ME460', 'ME462', 'ME464', 'ME471', 'ME473', 'ME475',
        'ME476', 'ME477', 'ME478', 'ME488', 'ME490', 'ME491', 'ME492', 'ME493', 'ME496', 'ME497',
      ],
      need: 4,
    },
  ],
}

const electricalCore: RequirementGroup[] = [
  ...commonFirstYear,
  single('GE143'),
  single('GE153'),
  single('CMPT146'),
  // Year 2
  ...['CMPT214', 'EE205', 'EE232', 'EE265', 'EP202', 'MATH223', 'EE216', 'EE221', 'EE241', 'EE271', 'EP214', 'MATH224'].map(single),
  // Years 3-4
  ...['CME331', 'GE348', 'EE382', 'RCM200', 'GE449', 'EE495'].map(single),
  // Science Elective List 1 or List 2
  { courses: ['BIOL120', 'GEOL121', ...scienceElectives.filter((c) => c !== 'BIOL120')], need: 1 },
]

// Electrical students must complete two of these four focus areas.
const focusAreas = [
  { id: 'power', name: 'Power and Energy', courses: ['EE341', 'EE343', 'EE342', 'EE441', 'EE442', 'EE448'] },
  { id: 'dsp', name: 'Signal Processing', courses: ['CME341', 'EE362', 'EE365', 'EE456', 'EE461', 'EE465'] },
  { id: 'sensors', name: 'Sensors, Circuits and Devices', courses: ['EE301', 'EE321', 'EE322', 'EE471', 'EE473', 'EE472'] },
  { id: 'robotics', name: 'Autonomous Mobile Robotics', courses: ['EE367', 'EE368', 'EE466', 'EE467', 'EE469', 'EE464'] },
]

// One specialization per real pair of focus areas, so each is a complete degree rather than half of one.
const electrical: Specialization[] = focusAreas.flatMap((a, i) =>
  focusAreas.slice(i + 1).map((b) => ({
    id: `electrical-engineering-${a.id}-${b.id}`,
    name: `Electrical Engineering: ${a.name} + ${b.name}`,
    requirements: [...electricalCore, ...a.courses.map(single), ...b.courses.map(single)],
  })),
)

export const engineering: Program = {
  id: 'engineering',
  name: 'Engineering',
  courseTitles: {},
  specializationsAreMajors: true,
  coursesPerTerm: 5,
  specializations: [civil, mechanical, ...electrical],
}
