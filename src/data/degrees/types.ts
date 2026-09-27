// A degree's own requirements in credit units, as the University Catalogue writes them (C1-C5 for an
// Arts & Science B.Sc.). This is the contract the degree data (src/data/degrees/*), the degree audit
// (src/lib/degree.ts), the planner and the skill tree share.
import type { JuniorCap } from './juniorCaps.js'

/** Arts & Science program types and requirement attributes, from Banner's section attributes. */
export type BreadthType = 'HUM' | 'SOCS' | 'FNAR' | 'SCIE' | 'ELWR' | 'ILRQ' | 'QRRQ'

export type DegreeBlock = 'C1' | 'C2' | 'C3' | 'C4' | 'C5'

export interface DegreeGroup {
  /** Stable id: 'c1-writing', 'c4-core-senior'. */
  id: string
  block: DegreeBlock
  /**
   * The requirement as a student reads it, and the label of its unnamed slots in a plan:
   * "English writing", "Breadth: Humanities or Social Science", "Junior science".
   */
  label: string
  /** Credit units this requirement needs ("Choose 6 credit units"). */
  needCu: number
  /** Courses the page lists. */
  courses: string[]
  /**
   * Also counts: a rule for what the page gives by attribute or number rather than by list
   * ("any senior-level Humanities course", "CMPT courses numbered 410 or higher").
   */
  matches?: (code: string) => boolean
  /** "A or B" items: at most one course of each set counts here ("MATH 116 or MATH 134 or MATH 177"). */
  oneOf?: string[][]
  /** "A and B" items: these count only together ("MATH 361 and MATH 362"). */
  allOf?: string[][]
  /** Picked by the student from a long list: planned as unnamed slots, never as a named course. */
  open?: boolean
  /** Preferred picks, best first (the page's "recommended" STAT 242*), ahead of list order. */
  prefer?: string[]
  /** The advising sheet's year tag (1-4): the year advisors put this requirement in. */
  year?: number
  /** How many of its credit units the year tag covers; the rest fall a year later (two of three sciences in Year 1). */
  yearCu?: number
  /**
   * When its year is full, this is the slot that moves to the next one (the sheet's Year 1 Winter
   * "Indigenous or breadth").
   */
  flexible?: boolean
  /** Areas within the group with a per-area ceiling (C3 junior science: at most 6 cu from one area). */
  areas?: { capCu: number; byArea: Record<string, string[]> }
  /** At least `cu` of this group from these program types (C2: 3 cu of Humanities or Social Science). */
  typeMin?: { cu: number; types: BreadthType[] }
}

export interface DegreeMilestone {
  id: string
  label: string
  /** Placed on the trunk once this many credit units are done or planned. */
  afterCu: number
  detail: string
  /** The published rule this comes from. */
  source: string
}

export interface Degree {
  id: string
  name: string
  /** 'bsc-4' | 'bsc-honours' | 'bsc-3'. */
  variant: string
  totalCu: number
  /** Credit units at the 200 level or higher. */
  minSeniorCu: number
  groups: DegreeGroup[]
  /**
   * "No more than 6 credit units from one subject may be used in Requirements C1, C2, and the Junior
   * Course Requirements in C3", except up to `exception.cu` in one subject across the ELW and IL groups.
   */
  subjectCap?: { cu: number; groups: string[]; exception?: { cu: number; groups: string[] } }
  /**
   * The college's "Maximum Junior Credit Units by Subject" (src/data/degrees/juniorCaps.ts): 100-level
   * credit in a subject past its cap counts toward neither the total nor any requirement.
   */
  juniorCaps?: Record<string, JuniorCap>
  milestones?: DegreeMilestone[]
  /** Where every list and number came from (URLs). */
  sources: string[]
}
