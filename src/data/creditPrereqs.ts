import type { CreditRequirement } from './prereqs.ts'

// Credit-count prerequisites, copied by hand from the 2026-27 catalogue (catalogue.usask.ca), for the
// courses a Computer Science plan schedules. The scraper also reads these phrases where it can
// (CourseInfo.creditRequires); this table makes sure the ones the demo depends on never drop out.
export const creditPrereqs: Record<string, CreditRequirement[]> = {
  // "Completion of at least 6 credit units in 100-level CMPT"
  PHIL232: [{ cu: 6, subjects: ['CMPT'], level: 100 }],
  // "...; and 9 credit units of MATH or STAT courses"
  CMPT360: [{ cu: 9, subjects: ['MATH', 'STAT'] }],
  CMPT364: [{ cu: 9, subjects: ['MATH', 'STAT'] }],
  // "6 credit units of 300-level CMPT; and one of MATH 164.3, ..."
  CMPT485: [{ cu: 6, subjects: ['CMPT'], level: 300 }],
  // The Honours thesis: "Admission to the Honours program" (bsc-honours-computer-science.php).
  CMPT400: [{ cu: 60, standing: 'honours' }],
}
