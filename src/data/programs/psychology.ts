import type { Program } from './types.js'
import type { RequirementGroup } from '../specializations.js'
import { codesIn, single, subjectAtLevels } from './helpers.js'

// Source: programs.usask.ca/arts-and-science/psychology/ba-4-psychology.php, B4 Major Requirement
// (University Catalogue 2026-27, checked 2026-09-26). Major requirement only, like Physics.
//
// The "any PSY 200-level" and "any PSY 400-level" slots are enumerated from the scraped catalogue,
// minus every course named elsewhere in the major so none counts twice.
// Listed on the program page but no longer in the catalogue (catalogue.usask.ca, 2026-09-26), so
// left out of the option lists: PSY243, PSY261.
const named: RequirementGroup[] = [
  ...['PSY120', 'PSY121', 'PSY233', 'PSY234', 'PSY235'].map(single),
  {
    // Group 1: cultural, social, and environmental influences on behaviour (6 cu)
    courses: [
      'PSY207', 'PSY213', 'PSY214', 'PSY216', 'PSY222', 'PSY223', 'PSY224', 'PSY225', 'PSY226', 'PSY227',
      'PSY230', 'PSY231', 'PSY236', 'PSY257', 'PSY260',
    ],
    need: 2,
  },
  // Group 2: cognitive, neuropsychological, and biological influences on behaviour (6 cu)
  { courses: ['PSY242', 'PSY246', 'PSY252', 'PSY253', 'PSY255', 'PSY256'], need: 2 },
  // Group 1A or 2A (3 cu)
  { courses: ['PSY315', 'PSY317', 'PSY323', 'PSY325', 'PSY347', 'PSY355'], need: 1 },
]

export const psychology: Program = {
  id: 'psychology',
  name: 'Psychology',
  courseTitles: {},
  specializationsAreMajors: true,
  specializations: [
    {
      id: 'psychology-major',
      name: 'Psychology (B.A. Four-year)',
      requirements: [
        ...named,
        { courses: subjectAtLevels('PSY', [200], codesIn(named)), need: 1 },
        { courses: subjectAtLevels('PSY', [400], codesIn(named)), need: 1 },
      ],
    },
  ],
}
