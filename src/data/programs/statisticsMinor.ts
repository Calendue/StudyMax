import type { Program } from './types.js'
import { single } from './helpers.js'
import { courseTitles } from '../courseTitles.js'

// Source: programs.usask.ca/arts-and-science/statistics/minor-statistics.php (18 credit units,
// standard track — a separate alternate track exists for Economics/Business Economics majors,
// not encoded here).
//
// The final elective group lists a few paired options (e.g. "COMM104 and COMM207" together) among
// otherwise-independent single courses; flattened to a loose choose-1-of-12 — every code is real
// and verified, but the engine won't enforce that a paired option is taken as a pair.
export const statisticsMinor: Program = {
  id: 'statistics-minor',
  name: 'Statistics Minor',
  kind: 'minor',
  courseTitles,
  specializations: [
    {
      id: 'statistics-minor',
      name: 'Statistics Minor',
      requirements: [
        { courses: ['STAT103', 'STAT241'], need: 1 },
        single('STAT344'),
        single('STAT345'),
        single('STAT348'),
        { courses: ['MATH164', 'MATH266'], need: 1 },
        {
          courses: ['COMM104', 'COMM207', 'GE210', 'PLSC214', 'PSY233', 'PSY234', 'STAT242', 'STAT244', 'SOC225', 'SOC325', 'STAT245', 'STAT246'],
          need: 1,
        },
      ],
    },
  ],
}
