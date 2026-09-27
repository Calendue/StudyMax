// Hand-fixed prerequisites for courses the scraper (scripts/scrape-catalogue.ts) parses wrong, read
// from each course's prerequisiteText in src/data/prereqs.ts (the 2026-27 catalogue). src/lib/catalog.ts
// applies them, winning over the scraper; prereqs.ts itself is generated and never edited.
//
// Shape: `requires` is AND-of-OR (CNF), which is exact: "(A and B) or C" = (A or C) and (B or C);
// "any two of a, b, c" = (a or b) and (a or c) and (b or c). An option the catalogue still names but
// courseInfo doesn't have (a retired course) is dropped only when another option in its group is
// there. A field left out keeps the scraper's value. scripts/check-offerings.ts fails on a code
// here that isn't in courseInfo.

export interface PrereqOverride {
  /** Replaces CourseInfo.requires: passed in an earlier term. */
  requires?: string[][]
  /** Replaces CourseInfo.concurrent: may share the term. */
  concurrent?: string[][]
  /** Replaces CourseInfo.antirequisites. */
  antirequisites?: string[]
  /** Minimum percent needed in a prerequisite, by code. Data only; the scheduler doesn't read grades. */
  minGrade?: Record<string, number>
  /** The catalogue's rule, and what was fixed. */
  note: string
}

export const prereqOverrides: Record<string, PrereqOverride> = {
  EE216: {
    // (134 or 123) and (134 or 124); MATH 123 and 124 are retired.
    requires: [['MATH134']],
    note: 'MATH 134 or (MATH 123 and MATH 124). The scraper required the retired MATH 124.',
  },
  MATH134: {
    // (133 or 110 or 123 or 176) and (133 or 164 or 264 or 266); MATH 123 and 264 are retired.
    requires: [
      ['MATH133', 'MATH110', 'MATH176'],
      ['MATH133', 'MATH164', 'MATH266'],
    ],
    note: 'MATH 133; or [(MATH 110 or 123 or 176) and (MATH 164 or 264 or 266)]. The scraper always required MATH 133.',
  },
  MATH361: {
    requires: [
      ['MATH163', 'MATH266'],
      ['MATH164', 'MATH266'],
    ],
    note: 'MATH 163 and MATH 164; or MATH 266. The scraper required all three.',
  },
  MATH362: {
    requires: [
      ['MATH163', 'MATH266'],
      ['MATH164', 'MATH266'],
    ],
    note: 'MATH 163 and MATH 164; or MATH 266. The scraper required all three.',
  },
  MATH339: {
    requires: [
      ['MATH224', 'MATH226', 'MATH277', 'MATH238'],
      ['MATH224', 'MATH226', 'MATH277', 'MATH276'],
    ],
    note: 'MATH 224; or 226; or 277; or (238 and 276); or approval of the instructor. The scraper required all five.',
  },
  MATH352: {
    // 266 and [(238 and 277) or (223 and 224) or (225 and 226)]: one clause per pick of one from each pair.
    requires: [
      ['MATH266'],
      ['MATH238', 'MATH223', 'MATH225'],
      ['MATH238', 'MATH223', 'MATH226'],
      ['MATH238', 'MATH224', 'MATH225'],
      ['MATH238', 'MATH224', 'MATH226'],
      ['MATH277', 'MATH223', 'MATH225'],
      ['MATH277', 'MATH223', 'MATH226'],
      ['MATH277', 'MATH224', 'MATH225'],
      ['MATH277', 'MATH224', 'MATH226'],
    ],
    minGrade: { MATH225: 80, MATH226: 80 },
    note: 'MATH 266; and (238 and 277) or (223 and 224) or (225 and 226 with 80% and permission). The scraper garbled the groups.',
  },
  CHEM115: {
    // CHEM 111 and 114 are retired.
    requires: [['CHEM112']],
    note: 'CHEM 111, 112 or 114. The scraper kept only the retired CHEM 111.',
  },
  CHEM250: {
    // 112, or (146 and CHE 113), or (112 and 146): the third is inside the first.
    requires: [
      ['CHEM112', 'CHEM146'],
      ['CHEM112', 'CHE113'],
    ],
    note: 'CHEM 112; or CHEM 146 and CHE 113; or CHEM 112 and CHEM 146. The scraper required all three.',
  },
  STAT342: {
    requires: [['MATH225', 'MATH276'], ['STAT241'], ['STAT242']],
    note: 'MATH 225 or 276; STAT 241 and 242. The scraper dropped MATH 276 and STAT 242.',
  },
  STAT443: {
    // MATH 264 is retired.
    requires: [['MATH164', 'MATH266'], ['STAT342'], ['STAT344', 'STAT345']],
    note: 'MATH 164 (formerly 264) or MATH 266, STAT 342, and STAT 344 or 345. The scraper merged STAT 342 into the MATH group and dropped STAT 345.',
  },
  STAT349: {
    requires: [['STAT241'], ['STAT344', 'STAT345']],
    note: 'STAT 241, and STAT 344 or 345. The scraper dropped STAT 345.',
  },
  MATH439: {
    requires: [['MATH238'], ['MATH276'], ['MATH277']],
    note: 'MATH 238, 276 and 277. The scraper dropped 276 and 277.',
  },
  POLS236: {
    // Any two of 110, 111, 112. The "or 18 credit units at the university level" alternative can't
    // sit beside it in CNF, so the plan uses the course rule, which always satisfies the catalogue.
    requires: [
      ['POLS110', 'POLS111'],
      ['POLS110', 'POLS112'],
      ['POLS111', 'POLS112'],
    ],
    note: 'Any two of POLS 110, 111, 112; or 18 credit units at the university level. The scraper read it as one of the three.',
  },
  CMPT489: {
    antirequisites: ['CMPT828'],
    note: 'Antirequisite CMPT 498 dropped: it is the generic special-topics number, so any CMPT 498 credit barred 489.',
  },
  CMPT145: {
    minGrade: { CMPT141: 60, CMPT142: 60 },
    note: '60% in CMPT 141 or CMPT 142.',
  },
  CMPT214: {
    minGrade: { CMPT145: 60, CMPT146: 60 },
    note: '60% or higher in CMPT 145 or 146.',
  },
  CMPT263: {
    minGrade: { CMPT145: 60, CMPT146: 60 },
    note: '60% or higher in CMPT 145 or 146.',
  },
  CMPT270: {
    minGrade: { CMPT145: 60, CMPT146: 60 },
    note: '60% or higher in CMPT 145 or 146.',
  },
}
