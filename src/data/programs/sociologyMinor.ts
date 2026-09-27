import type { Program } from './types.js'
import { subjectAtLevels, wholeCourses } from './helpers.js'
import { courseTitles } from '../courseTitles.js'

// Source: programs.usask.ca/arts-and-science/sociology/minor-sociology.php (University Catalogue
// 2026-27, checked 2026-09-27). 18 credit units of Sociology. Only one of this and the Minor in
// Crime, Law and Justice Studies can be recognized (that one isn't mapped here).
export const sociologyMinor: Program = {
  id: 'sociology-minor',
  name: 'Sociology Minor',
  kind: 'minor',
  courseTitles,
  specializations: [
    {
      id: 'sociology-minor',
      name: 'Sociology Minor',
      requirements: [{ courses: wholeCourses(subjectAtLevels('SOC', [100, 200, 300, 400])), need: 6, label: 'Any SOC course' }],
    },
  ],
}
