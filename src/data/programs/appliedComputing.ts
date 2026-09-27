import type { Program } from './types.js'
import { single } from './helpers.js'
import { courseTitles } from '../courseTitles.js'

// Source: programs.usask.ca/arts-and-science/applied-computing/bsc-4-applied-computing-{stream}.php
// Each stream has its own C4 Major Requirement. Bioinformatics and Interactive System Design are
// skipped: each has one open-ended elective bucket (e.g. "any ART course numbered 111+", or an
// expanded biology/chemistry list) that doesn't map to a closed, enumerated course list.
//
// The "choose N credit units from three specialization areas" groups in each stream are flattened
// into one pool (mixing across areas is allowed by the page's own wording, not a simplification).
export const appliedComputing: Program = {
  id: 'applied-computing',
  name: 'Applied Computing',
  courseTitles,
  specializations: [
    {
      id: 'applied-computing-data-analytics',
      name: 'Applied Computing — Data Analytics',
      requirements: [
        single('CMPT141'),
        single('CMPT145'),
        { courses: ['CMPT260', 'CMPT263'], need: 1 },
        single('CMPT270'),
        single('CMPT280'),
        single('CMPT317'),
        single('CMPT318'),
        single('CMPT384'),
        single('CMPT423'),
        single('MATH211'),
        single('MATH266'),
        single('STAT241'),
        { courses: ['MATH116', 'MATH134', 'MATH177'], need: 1 },
        { courses: ['STAT242', 'STAT245'], need: 1 },
        { courses: ['CMPT214', 'CMPT353', 'CMPT360', 'CMPT370', 'CMPT394', 'CMPT484', 'CMPT489'], need: 4 },
        { courses: ['MATH238', 'MATH313', 'MATH314', 'MATH325', 'MATH327'], need: 2 },
        { courses: ['STAT344', 'STAT345', 'STAT448'], need: 2 },
        { courses: ['MATH238', 'MATH313', 'MATH314', 'MATH325', 'MATH327', 'STAT344', 'STAT345', 'STAT448'], need: 1 },
      ],
    },
    {
      id: 'applied-computing-business',
      name: 'Applied Computing — Business',
      requirements: [
        single('CMPT141'),
        single('CMPT145'),
        single('CMPT214'),
        { courses: ['CMPT260', 'CMPT263'], need: 1 },
        single('CMPT270'),
        single('CMPT280'),
        single('CMPT370'),
        single('CMPT371'),
        single('COMM100'),
        single('COMM101'),
        single('COMM105'),
        single('COMM204'),
        single('COMM225'),
        single('COMM306'),
        { courses: ['STAT242', 'STAT245'], need: 1 },
        {
          courses: [
            'CMPT340', 'CMPT353', 'CMPT453', 'CMPT470',
            'CMPT317', 'CMPT318', 'CMPT384', 'CMPT423', 'CMPT489',
            'CMPT281', 'CMPT381', 'CMPT412', 'CMPT481',
          ],
          need: 4,
        },
        { courses: ['COMM203', 'COMM205', 'COMM348', 'COMM349', 'COMM352', 'COMM354', 'COMM357'], need: 3 },
      ],
    },
    {
      id: 'applied-computing-geomatics',
      name: 'Applied Computing — Geomatics',
      requirements: [
        single('CMPT141'),
        single('CMPT145'),
        { courses: ['CMPT260', 'CMPT263'], need: 1 },
        single('CMPT270'),
        single('CMPT280'),
        single('CMPT318'),
        single('CMPT384'),
        single('CMPT487'),
        single('GEOG222'),
        single('GEOG322'),
        single('GEOG302'),
        single('GEOG323'),
        { courses: ['STAT242', 'STAT245'], need: 1 },
        { courses: ['GEOG120', 'GEOG125', 'GEOG130'], need: 1 },
        {
          courses: ['CMPT214', 'CMPT353', 'CMPT370', 'CMPT317', 'CMPT360', 'CMPT423', 'CMPT489', 'CMPT381', 'CMPT481', 'CMPT484'],
          need: 4,
        },
        { courses: ['PLAN350', 'PLAN360', 'PLAN390', 'GEOG420', 'GEOG423', 'PLSC202', 'PLSC402'], need: 2 },
      ],
    },
  ],
}
