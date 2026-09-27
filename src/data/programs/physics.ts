import type { Program } from './types.js'
import { single } from './helpers.js'
import { courseTitles } from '../courseTitles.js'

// Source: programs.usask.ca/arts-and-science/physics/bsc-4-physics.php
// C4 Major Requirement, 42 credit units. Fully enumerated — no open-ended course-level buckets.
//
// The final elective group mixes courses of different credit weights (mostly .3, but EP253.1,
// EP353.2/EP354.2, PHYS453.2/455.3, PHYS493.6/499.6) inside one "choose 15 credit units" bucket.
// `need: 5` approximates 15cu ÷ 3cu-per-course — real students choosing a heavier course could
// satisfy it with fewer picks. Every listed code is real and verified either way.
export const physics: Program = {
  id: 'physics',
  name: 'Physics',
  courseTitles,
  specializations: [
    {
      id: 'physics-major',
      name: 'Physics (Four-year)',
      requirements: [
        single('EP202'),
        single('PHYS115'),
        { courses: ['PHYS117', 'PHYS125'], need: 1 },
        single('PHYS223'),
        single('PHYS252'),
        single('PHYS323'),
        single('PHYS356'),
        single('PHYS371'),
        single('PHYS383'),
        single('PHYS490'),
        {
          courses: [
            'ASTR213', 'ASTR214', 'ASTR310', 'ASTR312', 'ASTR411',
            'EE221',
            'EP228', 'EP253', 'EP271', 'EP317', 'EP325', 'EP353', 'EP354', 'EP417', 'EP421', 'EP428',
            'PHYS255', 'PHYS322', 'PHYS402', 'PHYS403', 'PHYS404', 'PHYS422', 'PHYS452', 'PHYS453',
            'PHYS455', 'PHYS456', 'PHYS461', 'PHYS470', 'PHYS471', 'PHYS472', 'PHYS473', 'PHYS481',
            'PHYS482', 'PHYS491', 'PHYS493', 'PHYS498', 'PHYS499',
          ],
          need: 5,
        },
      ],
    },
  ],
}
