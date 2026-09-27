import type { Program } from './types.js'
import type { RequirementGroup } from '../specializations.js'
import { single } from './helpers.js'

// Sources (University Catalogue 2026-27, checked 2026-09-26):
// - programs.usask.ca/education/bachelor-of-education-bed/bed-early-middle-years.php
// - programs.usask.ca/education/bachelor-of-education-bed/bed-secondary.php
//
// Only the College of Education's own prescribed courses. Left out: the teaching areas and external
// course requirements (each is "any course in subject X", chosen per teaching area) and the
// education electives (open-ended).
//
// Extended practicum is "EXPR 422.15, or EXPR 423.3 + 425.12, or EXPR 424.3 + 425.12". The model
// can't express alternative bundles, so it's one slot met by EXPR 422 or EXPR 425.

const learningCommunities = ['EDLC101', 'EDLC102', 'EDLC201', 'EDLC202'].map(single)
const practicum: RequirementGroup = { courses: ['EXPR422', 'EXPR425'], need: 1 }
const capstone: RequirementGroup = { courses: ['EADM411', 'ECUR411', 'EFDT411', 'EPSE411'], need: 1 }

export const education: Program = {
  id: 'education',
  name: 'Education',
  courseTitles: {},
  specializationsAreMajors: true,
  coursesPerTerm: 5,
  specializations: [
    {
      id: 'bed-early-middle-years',
      name: 'Early/Middle Years (B.Ed.)',
      requirements: [
        ...learningCommunities,
        { courses: ['ECUR163', 'ECUR164'], need: 1 },
        single('EFDT101'),
        { courses: ['EFDT265', 'ECUR265'], need: 1 },
        single('EPSE202'),
        // Year 3 — the Early/Middle Years column, which allows either the early- or middle-years version.
        ...['EDST321', 'EFDT301', 'EFDT313', 'EPSE348'].map(single),
        // "ECUR 307.3 and ECUR 308.3 or ECUR 309.3 and ECUR 310.3"
        { courses: ['ECUR307', 'ECUR308', 'ECUR309', 'ECUR310'], need: 2 },
        { courses: ['ECUR312', 'ECUR314'], need: 1 },
        { courses: ['ECUR322', 'ECUR323'], need: 1 },
        { courses: ['ECUR382', 'ECUR383'], need: 1 },
        single('EDST375'),
        // Year 4
        practicum,
        single('EADM303'),
        single('EPSE390'),
        capstone,
        { courses: ['EART303', 'EART304', 'ECUR352', 'ECUR353', 'ECUR450', 'ECUR451'], need: 1 },
      ],
    },
    {
      id: 'bed-secondary',
      name: 'Secondary (B.Ed.)',
      requirements: [
        ...learningCommunities,
        single('ECUR165'),
        single('EFDT101'),
        { courses: ['EFDT265', 'ECUR265'], need: 1 },
        single('EPSE202'),
        // Year 3
        ...['ECUR320', 'ECUR325', 'EDST321', 'EFDT301', 'EFDT313', 'EPSE348', 'EPSE390'].map(single),
        {
          // 6 cu of methods: one per teaching area (ECUR 340 + 341 when Practical and Applied Arts is one).
          courses: ['EART331', 'ECUR318', 'ECUR326', 'ECUR349', 'ECUR357', 'ECUR362', 'ECUR379', 'ECUR386', 'ECUR340', 'ECUR341'],
          need: 2,
        },
        single('EDST375'),
        // Year 4
        practicum,
        single('EADM303'),
        capstone,
      ],
    },
  ],
}
