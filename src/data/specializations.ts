// Source: USask BSc/Honours Computer Science catalogue (programs.usask.ca), 2026-27.
// 12 specializations exist in the catalogue — there is no 13th.

export interface RequirementGroup {
  /** Course codes that can satisfy this slot (a single code, or several "choose N of these"). */
  courses: string[]
  /** How many of `courses` are required. 1 for a single/either-or course. */
  need: number
  /**
   * An open choice ("any humanities course"): `courses` is what counts when it's already done, but the
   * plan shows an unnamed slot with this label instead of picking one of them.
   */
  label?: string
  /**
   * The advising sheet's year tag (1-4) for this slot: the year advisors put it in. The planner
   * treats it as the slot's recommended year, so college requirements land in Year 1, not Year 4.
   */
  year?: number
  /** Preferred picks, best first (the page's "recommended" STAT 242*), ahead of list order. */
  prefer?: string[]
}

export interface Specialization {
  id: string
  name: string
  requirements: RequirementGroup[]
  /**
   * Why it can't be finished from the current catalogue (a required course the 2026-27 catalogue no
   * longer lists). Such a specialization is never the default or "closest" target.
   */
  unavailable?: string
  /**
   * A required course that rarely runs: few or no Banner sections in the last three years (checked
   * by scripts/check-offerings.ts). The specialization stays plannable; this is what to warn about.
   */
  atRisk?: string
}

const single = (course: string): RequirementGroup => ({ courses: [course], need: 1 })

export const specializations: Specialization[] = [
  {
    id: 'algorithmics',
    name: 'Algorithmics',
    requirements: [
      single('CMPT145'),
      { courses: ['CMPT260', 'CMPT263'], need: 1 },
      single('CMPT270'),
      single('CMPT280'),
      single('CMPT360'),
      single('CMPT364'),
      single('CMPT463'),
    ],
  },
  {
    id: 'artificial-intelligence',
    name: 'Artificial Intelligence',
    requirements: [
      single('CMPT145'),
      { courses: ['CMPT260', 'CMPT263'], need: 1 },
      single('CMPT270'),
      single('CMPT280'),
      single('CMPT317'),
      single('CMPT423'),
      single('CMPT489'),
      { courses: ['STAT242', 'STAT245'], need: 1 },
    ],
  },
  {
    id: 'programming-languages',
    name: 'Programming Languages',
    atRisk: 'CMPT 440 has had no section since at least Fall 2024, and CMPT 442 ran only in Fall 2025',
    requirements: [
      single('CMPT145'),
      single('CMPT214'),
      { courses: ['CMPT260', 'CMPT263'], need: 1 },
      single('CMPT270'),
      single('CMPT340'),
      // The page's "Choose 6 credit units" also lists CMPT 435, which the 2026-27 catalogue no longer has
      // (catalogue.usask.ca/CMPT-435 is a 404), so the choice is both of CMPT 440 and CMPT 442.
      { courses: ['CMPT440', 'CMPT442'], need: 2 },
    ],
  },
  {
    id: 'web-development',
    name: 'Web Development',
    requirements: [
      single('CMPT145'),
      single('CMPT270'),
      single('CMPT280'),
      single('CMPT353'),
      single('CMPT381'),
      single('CMPT453'),
    ],
  },
  {
    id: 'software-development',
    name: 'Software Development',
    requirements: [
      single('CMPT145'),
      single('CMPT270'),
      single('CMPT280'),
      single('CMPT370'),
      single('CMPT371'),
      single('CMPT470'),
    ],
  },
  {
    id: 'computer-systems',
    name: 'Computer Systems',
    atRisk: 'CMPT 432 ran only in Winter 2025, and CMPT 433 only in Winter 2026',
    requirements: [
      single('CMPT145'),
      single('CMPT214'),
      single('CMPT270'),
      single('CMPT280'),
      single('CMPT332'),
      single('CMPT432'),
      { courses: ['CMPT433', 'CMPT434'], need: 1 },
    ],
  },
  {
    id: 'cybersecurity',
    name: 'Cybersecurity',
    atRisk: 'CMPT 438 ran in Winter 2025 and Fall 2025 and has no section in 2026-27',
    requirements: [
      single('CMPT145'),
      single('CMPT214'),
      single('CMPT270'),
      single('CMPT280'),
      single('CMPT332'),
      single('CMPT438'),
      single('CMPT439'),
    ],
  },
  {
    id: 'computer-graphics',
    name: 'Computer Graphics',
    requirements: [
      single('CMPT145'),
      single('CMPT270'),
      single('CMPT280'),
      single('CMPT384'),
      single('CMPT485'),
      single('CMPT487'),
      single('MATH266'),
    ],
  },
  {
    id: 'computer-game-development',
    name: 'Computer Game Development',
    requirements: [
      single('CMPT145'),
      single('CMPT270'),
      single('CMPT280'),
      single('CMPT306'),
      single('CMPT381'),
      single('CMPT406'),
      single('CMPT481'),
    ],
  },
  {
    id: 'information-visualization',
    name: 'Information Visualization',
    requirements: [
      single('CMPT145'),
      single('CMPT270'),
      single('CMPT280'),
      single('CMPT384'),
      single('CMPT394'),
      single('CMPT484'),
    ],
  },
  {
    id: 'computational-modelling',
    name: 'Computational Modelling',
    // catalogue.usask.ca/BINF-451 is a 404 and the 2026-27 course list has no BINF 451.
    unavailable: 'BINF 451 is not in the 2026-27 catalogue',
    requirements: [
      single('BINF451'),
      single('CMPT145'),
      single('CMPT270'),
      single('CMPT280'),
      single('CMPT384'),
      single('CMPT451'),
    ],
  },
  {
    id: 'social-computing',
    name: 'Social Computing',
    requirements: [
      single('CMPT145'),
      single('CMPT270'),
      single('CMPT280'),
      { courses: ['CMPT317', 'CMPT353'], need: 1 },
      single('CMPT412'),
      single('PHIL232'),
    ],
  },
]
