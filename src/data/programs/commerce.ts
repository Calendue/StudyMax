import type { Program } from './types.js'
import type { RequirementGroup } from '../specializations.js'
import { single } from './helpers.js'

// Sources (University Catalogue 2026-27, checked 2026-09-26):
// - programs.usask.ca/edwards/accounting/index.php
// - programs.usask.ca/edwards/finance/index.php
// - programs.usask.ca/edwards/marketing/index.php
//
// Years 1-2 are identical across the three pages, so they're one shared core; each major adds its
// own Year 3-4 block. Left out: "any elective" and "free senior electives" slots (open-ended).

// Listed on the program page but no longer in the catalogue (catalogue.usask.ca, 2026-09-26), so
// left out of the option lists: COMM358.
const core: RequirementGroup[] = [
  // Year 1
  single('COMM100'),
  // COMM 104, or a listed statistics course in its place.
  { courses: ['COMM104', 'EE216', 'GE210', 'PLSC214', 'PSY233', 'STAT241', 'STAT244', 'STAT245', 'STAT246'], need: 1 },
  ...['COMM105', 'COMM111', 'COMM121', 'COMM129', 'ECON111', 'ECON114'].map(single),
  // Year 2
  ...['COMM201', 'COMM203', 'COMM204', 'COMM205'].map(single),
  { courses: ['COMM207', 'STAT242', 'PSY234'], need: 1 },
  ...['COMM210', 'COMM211', 'COMM247', 'COMM249'].map(single),
  // Core in Years 3-4, shared by every major
  single('COMM304'),
  single('COMM401'),
]

export const commerce: Program = {
  id: 'commerce',
  name: 'Commerce',
  courseTitles: {},
  specializationsAreMajors: true,
  coursesPerTerm: 5,
  specializations: [
    {
      id: 'accounting',
      name: 'Accounting',
      requirements: [
        ...core,
        // Accounting's Year 3 core is COMM 304 only; it skips COMM 306/307.
        ...['COMM308', 'COMM321', 'COMM323', 'COMM324', 'COMM337'].map(single),
        ...['COMM406', 'COMM407', 'COMM414', 'COMM421', 'COMM433', 'COMM438'].map(single),
        // "COMM 412.3 or COMM 400.3" — COMM 400 isn't in the catalogue, so only COMM 412 is listed.
        single('COMM412'),
      ],
    },
    {
      id: 'finance',
      name: 'Finance',
      requirements: [
        ...core,
        ...['COMM306', 'COMM307', 'COMM363', 'COMM367', 'COMM461'].map(single),
        // Finance Major Electives: 6 cu in Year 3 + 9 cu in Year 4.
        { courses: ['COMM419', 'COMM429', 'COMM465', 'COMM466', 'COMM467', 'COMM469', 'COMM471'], need: 5 },
      ],
    },
    {
      id: 'marketing',
      name: 'Marketing',
      requirements: [
        ...core,
        ...['COMM306', 'COMM307', 'COMM340', 'COMM352', 'COMM354', 'COMM357', 'COMM473'].map(single),
        {
          // Marketing Major Electives: 9 cu.
          courses: ['COMM311', 'COMM450', 'COMM451', 'COMM452', 'COMM454', 'COMM456', 'COMM457', 'COMM458', 'COMM470'],
          need: 3,
        },
      ],
    },
  ],
}
