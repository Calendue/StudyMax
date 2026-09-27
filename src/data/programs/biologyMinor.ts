import type { Program } from './types.js'
import { subjectAtLevels, wholeCourses } from './helpers.js'
import { courseTitles } from '../courseTitles.js'

// Source: programs.usask.ca/arts-and-science/biology/minor-biology.php (University Catalogue
// 2026-27, checked 2026-09-27). 18 credit units: 6 of 100-level BIOL, and 12 of 200-, 300- or
// 400-level BIOL or PBIO 230, at least 3 of them at the 300 or 400 level. Courses in the student's
// own major requirement can't count (only matters for a major that requires BIOL; CS doesn't).
//
// The 300/400-level slot overlaps the senior group on purpose: the matcher counts a course once,
// and the narrower slot claims first, so 1 + 3 is "12 credit units, 3 of them 300-level or higher".
const senior = wholeCourses([...subjectAtLevels('BIOL', [200, 300, 400]), 'PBIO230'])

export const biologyMinor: Program = {
  id: 'biology-minor',
  name: 'Biology Minor',
  kind: 'minor',
  courseTitles,
  specializations: [
    {
      id: 'biology-minor',
      name: 'Biology Minor',
      requirements: [
        { courses: wholeCourses(subjectAtLevels('BIOL', [100])), need: 2, label: '100-level BIOL course' },
        { courses: wholeCourses(subjectAtLevels('BIOL', [300, 400])), need: 1, label: '300/400-level BIOL course' },
        { courses: senior, need: 3, label: 'Senior BIOL course' },
      ],
    },
  ],
}
