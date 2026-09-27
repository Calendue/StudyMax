import type { Program } from './types.js'
import { single, subjectAtLevels, wholeCourses } from './helpers.js'
import { courseTitles } from '../courseTitles.js'

// Source: programs.usask.ca/arts-and-science/economics/minor-economics.php (University Catalogue
// 2026-27, checked 2026-09-27). 21 credit units: ECON 111, ECON 114, and 15 more credit units in
// Economics. Not for Economics or Business Economics majors. "Any ECON" is enumerated from the
// scraped catalogue and planned as an unnamed slot.
export const economicsMinor: Program = {
  id: 'economics-minor',
  name: 'Economics Minor',
  kind: 'minor',
  courseTitles,
  specializations: [
    {
      id: 'economics-minor',
      name: 'Economics Minor',
      requirements: [
        single('ECON111'),
        single('ECON114'),
        { courses: wholeCourses(subjectAtLevels('ECON', [100, 200, 300, 400], ['ECON111', 'ECON114'])), need: 5, label: 'Any ECON course' },
      ],
    },
  ],
}
