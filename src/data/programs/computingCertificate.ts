import type { Program } from './types.js'
import { single } from './helpers.js'
import { courseTitles } from '../courseTitles.js'

// Source: programs.usask.ca/arts-and-science/computing/index.php (21 credit units).
// Fully enumerated — no open-ended course-level buckets.
export const computingCertificate: Program = {
  id: 'computing-certificate',
  name: 'Certificate in Computing',
  kind: 'certificate',
  courseTitles,
  specializations: [
    {
      id: 'computing-certificate',
      name: 'Certificate in Computing',
      requirements: [
        single('CMPT214'),
        single('CMPT270'),
        single('CMPT280'),
        { courses: ['CMPT141', 'CMPT142'], need: 1 },
        { courses: ['CMPT145', 'CMPT146'], need: 1 },
        { courses: ['CMPT318', 'CMPT353', 'CMPT370', 'CMPT381', 'CMPT384', 'CMPT394', 'CMPT439'], need: 1 },
        { courses: ['MATH110', 'MATH133', 'MATH176', 'STAT242', 'STAT245'], need: 1 },
      ],
    },
  ],
}
