import type { Program } from './types.js'
import { single } from './helpers.js'

// Source: programs.usask.ca/nursing/bsn/index.php (University Catalogue 2026-27, checked 2026-09-26).
//
// Left out: the pre-professional year's 6 cu of Humanities / Social Science electives, whose lists
// end in "any senior-level humanities (social science) course" and so can't be enumerated.
// Year 3's "one of the following pairs each semester" runs over three terms, so all three pairs are
// required (the year's 32 cu only adds up that way).
// Listed on the program page but no longer in the catalogue (catalogue.usask.ca, 2026-09-26), so
// left out of the option lists: ARCH472, EFDT335, EPSE302, SOC227, SOC235, MCIM224.
export const nursing: Program = {
  id: 'nursing',
  name: 'Nursing',
  courseTitles: {},
  specializationsAreMajors: true,
  coursesPerTerm: 5,
  specializations: [
    {
      id: 'bsn',
      name: 'Bachelor of Science in Nursing',
      requirements: [
        // Pre-professional year
        single('BIOL120'),
        single('NUTR120'),
        { courses: ['PSY120', 'PSY121'], need: 1 },
        single('SOC112'),
        { courses: ['INDG107', 'HIST195'], need: 1 },
        single('NURS120'),
        { courses: ['ENG110', 'ENG111', 'ENG112', 'ENG113', 'ENG114', 'ENG120', 'PHIL133'], need: 1 },
        {
          // STAT 244 or an equivalent listed on the page.
          courses: ['STAT244', 'STAT242', 'STAT245', 'STAT246', 'PLSC214', 'COMM104', 'PSY233', 'SOC225', 'GE210', 'EPSE441'],
          need: 1,
        },
        // Year 2
        ...['NURS200', 'NURS244', 'NURS245', 'NURS246', 'NURS247'].map(single),
        { courses: ['MCIM223', 'BMSC210', 'FABS212'], need: 1 },
        ...['NURS231', 'NURS241', 'NURS260', 'PHAR250', 'NURS205', 'NURS221'].map(single),
        // Year 3
        ...['NURS304', 'NURS306', 'NURS361', 'NURS362', 'NURS333', 'NURS367', 'NURS308', 'NURS370', 'NURS371'].map(single),
        // Year 4
        ...['NURS422', 'NURS430', 'NURS431', 'NURS440', 'NURS441', 'NURS460'].map(single),
        {
          // Restricted Electives List, USask courses only (AGMD 800 dropped: graduate-level, not in
          // the undergraduate catalogue).
          courses: [
            'CHEP402', 'CHEP403', 'COMM306', 'COMM384', 'EFDT301', 'EFDT435', 'ENVS401',
            'GENS201', 'GENS210', 'INDG230', 'INDG264', 'INDG265', 'KIN232', 'KIN423', 'KIN424', 'KIN426',
            'NURS405', 'NURS410', 'NURS478', 'NURS486', 'NUTR200', 'NUTR201', 'PHAR351', 'PHIL224', 'PHIL231',
            'PHIL234', 'PHIL293', 'POLS222', 'POLS262', 'PSY207', 'PSY213', 'PSY214', 'PSY216', 'PSY222', 'PSY223',
            'PSY226', 'PSY227', 'PSY230', 'PSY246', 'PSY253', 'PSY260', 'RLST282', 'SOC203', 'SOC204', 'SOC205',
            'SOC214', 'SOC219', 'SOC238', 'SOC242', 'SOC415', 'TOX402',
          ],
          need: 1,
        },
      ],
    },
  ],
}
