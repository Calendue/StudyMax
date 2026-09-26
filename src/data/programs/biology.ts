import type { Program } from './types.ts'
import { single, subjectAtLevels } from './helpers.ts'

// Source: programs.usask.ca/arts-and-science/biology/bsc-4-biology.php, C4 Major Requirement
// (University Catalogue 2026-27, checked 2026-09-26). Major requirement only, like Physics.
//
// The 18 cu elective bucket includes "BIOL — 200-Level, 300-Level, 400-Level", enumerated here
// from the scraped catalogue (minus the required BIOL courses and BIOL 312, which the page
// excludes). Not enforced: "3 credit units must be at the 300-level or higher".
const required = ['BIOL120', 'BIOL121', 'BIOL222', 'BIOL224', 'BIOL226', 'BIOL228', 'BIOL301', 'BIOL302']

export const biology: Program = {
  id: 'biology',
  name: 'Biology',
  courseTitles: {},
  specializationsAreMajors: true,
  specializations: [
    {
      id: 'biology-major',
      name: 'Biology (Four-year)',
      requirements: [
        ...required.map(single),
        {
          courses: [
            'ANBI470', 'ANSC313', 'ANTH270', 'BINF351', 'BMIS487', 'BMSC210', 'BMSC220', 'CPPS406', 'FABS212',
            'GEOL247', 'GEOL343', 'PBIO230', 'PLSC311', 'PLSC405', 'PLSC411', 'PLSC416', 'PLSC422', 'PLSC425',
            'PLSC475', 'TOX300', 'TOX301',
            ...subjectAtLevels('BIOL', [200, 300, 400], [...required, 'BIOL312']),
          ],
          need: 6,
        },
      ],
    },
  ],
}
