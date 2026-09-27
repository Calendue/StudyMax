import type { Program } from './types.js'
import { single } from './helpers.js'
import { courseTitles } from '../courseTitles.js'

// Source: programs.usask.ca/arts-and-science/formal-reasoning/index.php (21 credit units).
// Fully enumerated — no open-ended course-level buckets.
export const formalReasoningCertificate: Program = {
  id: 'formal-reasoning-certificate',
  name: 'Certificate in Formal Reasoning',
  kind: 'certificate',
  courseTitles,
  specializations: [
    {
      id: 'formal-reasoning-certificate',
      name: 'Certificate in Formal Reasoning',
      requirements: [
        single('PHIL140'),
        single('MATH163'),
        single('MATH164'),
        single('MATH266'),
        single('PHIL241'),
        single('PHIL243'),
        { courses: ['MATH361', 'MATH362', 'MATH364'], need: 1 },
      ],
    },
  ],
}
