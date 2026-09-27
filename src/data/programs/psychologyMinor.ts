import type { Program } from './types.js'
import { subjectAtLevels, wholeCourses } from './helpers.js'
import { courseTitles } from '../courseTitles.js'

// Source: programs.usask.ca/arts-and-science/psychology/minor-psychology.php (University Catalogue
// 2026-27, checked 2026-09-27). 18 credit units of Psychology, excluding PSY 101.
export const psychologyMinor: Program = {
  id: 'psychology-minor',
  name: 'Psychology Minor',
  kind: 'minor',
  courseTitles,
  specializations: [
    {
      id: 'psychology-minor',
      name: 'Psychology Minor',
      requirements: [{ courses: wholeCourses(subjectAtLevels('PSY', [100, 200, 300, 400], ['PSY101'])), need: 6, label: 'Any PSY course' }],
    },
  ],
}
