import type { Program } from './types.js'
import { subjectAtLevels, wholeCourses } from './helpers.js'
import { courseTitles } from '../courseTitles.js'

// Source: programs.usask.ca/arts-and-science/philosophy/philosophy-minor.php (University Catalogue
// 2026-27, checked 2026-09-27). 24 credit units of Philosophy, with any other major.
export const philosophyMinor: Program = {
  id: 'philosophy-minor',
  name: 'Philosophy Minor',
  kind: 'minor',
  courseTitles,
  specializations: [
    {
      id: 'philosophy-minor',
      name: 'Philosophy Minor',
      requirements: [{ courses: wholeCourses(subjectAtLevels('PHIL', [100, 200, 300, 400])), need: 8, label: 'Any PHIL course' }],
    },
  ],
}
