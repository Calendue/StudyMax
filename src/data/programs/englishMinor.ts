import type { Program } from './types.js'
import { subjectAtLevels, wholeCourses } from './helpers.js'
import { courseTitles } from '../courseTitles.js'

// Source: programs.usask.ca/arts-and-science/english/minor-english.php (University Catalogue
// 2026-27, checked 2026-09-27). 21 credit units: 6 of 100-level ENG, 6 of 300-level ENG, and 9 more
// of 200-, 300- or 400-level ENG. Not for English majors.
//
// The last group overlaps the 300-level one on purpose: the matcher counts a course once, and the
// narrower 300-level group claims first.
export const englishMinor: Program = {
  id: 'english-minor',
  name: 'English Minor',
  kind: 'minor',
  courseTitles,
  specializations: [
    {
      id: 'english-minor',
      name: 'English Minor',
      requirements: [
        { courses: wholeCourses(subjectAtLevels('ENG', [100])), need: 2, label: '100-level ENG course' },
        { courses: wholeCourses(subjectAtLevels('ENG', [300])), need: 2, label: '300-level ENG course' },
        { courses: wholeCourses(subjectAtLevels('ENG', [200, 300, 400])), need: 3, label: 'Senior ENG course' },
      ],
    },
  ],
}
