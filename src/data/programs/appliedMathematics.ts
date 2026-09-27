import type { Program } from './types.js'
import { single } from './helpers.js'
import { courseTitles } from '../courseTitles.js'

// Source: programs.usask.ca/arts-and-science/applied-mathematics/bsc-4-applied-mathematics.php
// C4 Major Requirement, 51 credit units. Fully enumerated — no open-ended course-level buckets.
//
// The first two groups approximate a "pick one full intro sequence" choice (e.g. MATH110+116,
// or MATH123+124, or MATH176+177) as a loose choose-2-of-6 — every listed code is real and
// verified, but the engine doesn't enforce that the two picks come from the same sequence.
export const appliedMathematics: Program = {
  id: 'applied-mathematics',
  name: 'Applied Mathematics',
  courseTitles,
  specializations: [
    {
      id: 'applied-mathematics-major',
      name: 'Applied Mathematics (Four-year)',
      requirements: [
        single('MATH164'),
        single('MATH211'),
        single('MATH238'),
        single('MATH336'),
        single('MATH436'),
        single('STAT241'),
        { courses: ['MATH110', 'MATH116', 'MATH123', 'MATH124', 'MATH176', 'MATH177'], need: 2 },
        { courses: ['MATH223', 'MATH224', 'MATH276', 'MATH277'], need: 2 },
        {
          courses: ['MATH266', 'MATH327', 'MATH328', 'MATH331', 'MATH339', 'MATH352', 'MATH371', 'MATH379', 'STAT242', 'STAT341'],
          need: 4,
        },
        { courses: ['MATH313', 'MATH314'], need: 1 },
        { courses: ['MATH438', 'MATH439', 'MATH452', 'MATH465', 'MATH485', 'MATH498', 'STAT442', 'STAT443'], need: 2 },
      ],
    },
  ],
}
