import type { Program } from './types.js'
import { single } from './helpers.js'
import { courseTitles } from '../courseTitles.js'

// Source: programs.usask.ca/arts-and-science/mathematical-modelling/index.php (30 credit units).
// Fully enumerated — no open-ended course-level buckets.
export const mathematicalModellingCertificate: Program = {
  id: 'mathematical-modelling-certificate',
  name: 'Certificate in Mathematical Modelling',
  kind: 'certificate',
  courseTitles,
  specializations: [
    {
      id: 'mathematical-modelling-certificate',
      name: 'Certificate in Mathematical Modelling',
      requirements: [
        single('MATH211'),
        single('MATH238'),
        { courses: ['MATH223', 'MATH225', 'MATH276'], need: 1 },
        { courses: ['MATH224', 'MATH226', 'MATH277'], need: 1 },
        single('STAT241'),
        single('MATH336'),
        { courses: ['MATH110', 'MATH133', 'MATH176'], need: 1 },
        { courses: ['MATH116', 'MATH134', 'MATH177'], need: 1 },
        { courses: ['MATH164', 'MATH266'], need: 1 },
        {
          courses: [
            'MATH313', 'MATH314', 'MATH325', 'MATH327', 'MATH328', 'MATH331', 'MATH339', 'MATH436',
            'STAT341', 'STAT342', 'STAT344', 'STAT345', 'STAT348', 'STAT349', 'STAT447', 'STAT448',
          ],
          need: 1,
        },
      ],
    },
  ],
}
