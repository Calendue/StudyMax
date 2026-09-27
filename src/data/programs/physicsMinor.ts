import type { Program } from './types.js'
import { subjectAtLevels, wholeCourses } from './helpers.js'
import { courseTitles } from '../courseTitles.js'

// Source: programs.usask.ca/arts-and-science/physics/minor-physics.php (University Catalogue
// 2026-27, checked 2026-09-27). 18 credit units of PHYS or the listed EP/EE courses, at least 3 of
// them at the 300 or 400 level and at most 9 at the 100 level.
//
// As courses: one at 300/400, two more at 200 or above, three from anything on the list. The groups
// overlap on purpose (the matcher counts a course once, narrowest group first), and together they
// cap the 100 level at three courses, the page's 9 credit units. Courses under 3 credit units
// (EP 253.1, 353.2, 354.2, PHYS 152.1, 453.2, 490.0) are left out: a group counts courses.
const ep = ['EE221', 'EP202', 'EP228', 'EP253', 'EP271', 'EP317', 'EP320', 'EP325', 'EP353', 'EP354', 'EP413', 'EP417', 'EP421', 'EP428']
const level = (code: string) => Number(code.match(/\d/)?.[0] ?? 0)
const all = wholeCourses([...subjectAtLevels('PHYS', [100, 200, 300, 400]), ...ep])

export const physicsMinor: Program = {
  id: 'physics-minor',
  name: 'Physics Minor',
  kind: 'minor',
  courseTitles,
  specializations: [
    {
      id: 'physics-minor',
      name: 'Physics Minor',
      requirements: [
        { courses: all.filter((c) => level(c) >= 3), need: 1, label: '300/400-level PHYS course' },
        { courses: all.filter((c) => level(c) >= 2), need: 2, label: 'Senior PHYS course' },
        { courses: all, need: 3, label: 'Any PHYS course' },
      ],
    },
  ],
}
