// The sample student: a real USask Computer Science DegreeWorks audit, dated 2026-08-06, reduced to
// course codes. Nothing identifying is kept, and the audit itself is not in this repo.
//
// CMPT 214's first attempt (grade 58, marked (R) and excluded) is dropped — only the retaken,
// included attempt (grade 82) counts as completed.
export const completedCourses: string[] = [
  'ASTR113',
  'CMPT141',
  'CMPT145',
  'CMPT214',
  'CMPT215',
  'CMPT263',
  'CMPT270',
  'CMPT280',
  'CMPT306',
  'CMPT317',
  'ECON111',
  'ECON114',
  'ENG113',
  'LING111',
  'MATH110',
  'MATH116',
  'MATH163',
  'MATH164',
  'MATH238',
  'PHIL133',
  'PHIL232',
  'PHYS115',
  'PHYS117',
  'PSY120',
  'STAT241',
  'STAT245',
  'STAT344',
  'STAT348',
]

// Registered but ungraded on the same audit, the seven preregistered classes. These are not
// completed, so they never satisfy a requirement; the app shows them so a student can see the
// difference between what they have and what they are sitting in right now.
/**
 * Which term each of those runs in, from USask's class search (checked 2026-09-26): CMPT 332, 360
 * and 370 run only in Fall 2026, CMPT 340, 353 and 434 only in Winter 2027. MATH 266 runs in both;
 * Fall is taken.
 */
export const inProgressTerms: Record<string, 'Fall' | 'Winter' | 'Spring/Summer'> = {
  CMPT332: 'Fall',
  CMPT360: 'Fall',
  CMPT370: 'Fall',
  MATH266: 'Fall',
  CMPT340: 'Winter',
  CMPT353: 'Winter',
  CMPT434: 'Winter',
}

export const inProgressCourses: string[] = [
  'CMPT332',
  'CMPT340',
  'CMPT353',
  'CMPT360',
  'CMPT370',
  'CMPT434',
  'MATH266',
]
