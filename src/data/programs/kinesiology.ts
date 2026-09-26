import type { Program } from './types.ts'
import { single } from './helpers.ts'

// Source: programs.usask.ca/kinesiology/exercise-and-sport-studies/bsc-kin-exercise.php
// (University Catalogue 2026-27, checked 2026-09-26).
//
// Left out: the 6 cu English/RCM 200 requirement ("ENG — 100-Level"), the Humanities/Social
// Science choice, the 18 cu outside-area requirement and unrestricted electives — all open-ended.
// The 27 cu of KIN electives (15 in Year 3, 12 in Year 4) are one list, so `need: 9` (27 ÷ 3); a
// few are 6 cu courses, so a student taking those needs fewer.
// Listed on the program page but no longer in the catalogue (catalogue.usask.ca, 2026-09-26), so
// left out of the option lists: KIN421, KIN430.
export const kinesiology: Program = {
  id: 'kinesiology',
  name: 'Kinesiology',
  courseTitles: {},
  specializationsAreMajors: true,
  coursesPerTerm: 5,
  specializations: [
    {
      id: 'bsc-kinesiology',
      name: 'B.Sc. Kinesiology (Exercise and Sport Studies)',
      requirements: [
        // Year 1
        ...['BIOL120', 'BIOL224', 'KIN121', 'KIN122', 'KIN150'].map(single),
        { courses: ['MATH104', 'MATH110'], need: 1 },
        // Year 2
        ...['CPPS221', 'KIN222', 'KIN225', 'KIN226', 'KIN231', 'KIN232', 'KIN281'].map(single),
        { courses: ['PLSC214', 'STAT245'], need: 1 },
        // Years 3-4
        ...['KIN306', 'KIN322', 'KIN380', 'KIN432'].map(single),
        {
          courses: [
            'KIN223', 'KIN233', 'KIN240', 'KIN250', 'KIN255', 'KIN310', 'KIN311', 'KIN320', 'KIN321', 'KIN324',
            'KIN325', 'KIN330', 'KIN334', 'KIN341', 'KIN350', 'KIN381', 'KIN382', 'KIN423', 'KIN424',
            'KIN425', 'KIN426', 'KIN428', 'KIN429', 'KIN431', 'KIN433', 'KIN434', 'KIN442', 'KIN450',
            'KIN451', 'KIN463', 'KIN471', 'KIN477', 'KIN481', 'KIN498', 'KIN499',
          ],
          need: 9,
        },
      ],
    },
  ],
}
