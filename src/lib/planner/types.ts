// The planner's contracts: the course data it reads (Catalog), the scheduling core's input and
// output (CoreInput/CoreResult, the seam check-plan-oracle.ts tests), the result the UI reads
// (PlanResult) and the replan diff (PlanDiff). Pure types: no React, no data imports.
//
// THE OBJECTIVE. For one input there is exactly one plan, the best under this lexicographic order:
//
// L0  Hard rules, never relaxed. A rule that makes the plan impossible is reported as a typed
//     Diagnostic (error), and the course it concerns is left out; the plan never bends it.
//     - The course runs in that season (CatalogCourse.seasons), and the term isn't blocked for it
//       (a not-offered/later override).
//     - Each AND-group of OR-prerequisites is passed in an EARLIER term; a `concurrent` group
//       (pre-or-co, "can be taken concurrently") may share the term.
//     - Credit-count rules, Honours standing, and the level gates: 300-level from 30 cu passed,
//       400-level from 60 cu passed.
//     - Planned courses per term <= max(0, load - booked) (load 1-5 Fall/Winter, 0-2 Spring/Summer,
//       0 = no Spring/Summer term); at most 15 cu per Fall/Winter term, booked included.
//     - At most 3 senior (300/400-level) CMPT per term, booked included; none in Spring/Summer.
//     - One course fills one requirement slot. Antirequisites are excluded.
//     - Booked (registered) courses are fixed in their terms.
//     - A full-year course takes a seat in a Fall AND the following Winter (cu split evenly); it is
//       passed only after that Winter.
//     - The internship year stays empty.
// L1  Earliest graduation term (the last term holding a planned or booked course).
// L2  Selection fidelity: each requirement group's option rank, in a fixed group order — the
//     degree's `prefer`/"recommended" markers, then program-listed, then Banner-published over
//     catalogue-only, then advancing more targets, then the code. An advisor-recommended course wins
//     unless it costs a term.
// L3  Fewest Spring/Summer courses.
// L4  Load fidelity: terms before the last filled to the chosen load where the rules allow; then the
//     fewest courses placed before their advising-year term.
// L5  Canonical tie-break: the lexicographically smallest vector of term indices over items sorted
//     by (group order, code), codes compared with plain `<` (never localeCompare); interchangeable
//     elective slots stay in non-decreasing term order.
// L1 and L2 are proven optimal (the result equals the lower bound, or the exact search proved it);
// L3-L5 are fixed by a deterministic procedure. Search budgets count NODES, never milliseconds, so
// the same input gives the same output on iOS, Android, Node and Vercel. Every Set/Map is sorted
// before it is iterated.
//
// SETTLED RULES (the validator encodes the same):
// (a) An elective slot counts as 3 cu toward the 30/60-cu level gates and toward credit rules with
//     no subject filter (CMPT 400's 60 cu), once its term ends; never toward a subject-filtered rule.
// (b) Load means planned courses <= max(0, cap - booked). Booked courses above the load are shown
//     (BOOKED_OVER_LOAD), never grown.
// (c) A Spring/Summer load of 0 means no Spring/Summer terms (springSummer false at the edges).
// (d) Relaxing any rule is a hard failure the engine must report, never a schedule.
// (e) Without a degree (programs other than CS, What if), the plan holds only the targets' courses;
//     for the level gates each Fall/Winter term before t is assumed full (3 cu × load) of the
//     student's other courses, independent of placement.

export type Season = 'Fall' | 'Winter' | 'Spring/Summer'

/** How sure we are a course runs when the data says it does. Banner beats the catalogue. */
export type OfferingConfidence = 'published' | 'annual-pattern' | 'alternating-pattern' | 'catalogue-only' | 'unknown'

export interface CreditRule {
  cu: number
  /** Only these subjects count (MATH, STAT); absent means any. */
  subjects?: string[]
  /** Only this level counts (100, 300); absent means any. */
  level?: number
  standing?: 'honours'
}

export interface CatalogCourse {
  cu: number
  /** AND-groups of OR-options passed in an EARLIER term. */
  requires: string[][]
  /** AND-groups of OR-options that may also be taken in the SAME term. */
  concurrent: string[][]
  credit: CreditRule[]
  antirequisites: string[]
  /** Seasons it runs in (Banner first, then the catalogue); [] when neither source says. */
  seasons: Season[]
  confidence: OfferingConfidence
  /** Spans Fall and the following Winter: a seat in each; starts in Fall. */
  fullYear: boolean
  /** Minimum grade (percent) needed in a prerequisite, by code. Data only; the scheduler doesn't read grades. */
  minGrade?: Record<string, number>
  /** No published section in the last 3 years of Banner data (CMPT 440). */
  atRisk?: boolean
}

/** Every course the planner may read, by code. check-plan-oracle.ts builds small synthetic ones. */
export type Catalog = Readonly<Record<string, CatalogCourse>>

// ---- the scheduling core (items already selected; the oracle's seam) ----

export interface CoreTerm {
  label: string
  season: Season
  /** Seats for planned courses: max(0, load - booked). 0 in an internship term. */
  cap: number
  /** Credit units for planned courses: 15 - booked cu in Fall/Winter; 3 × cap in Spring/Summer. */
  cuCap: number
  /** Senior CMPT room: 3 - booked senior CMPT in Fall/Winter; 0 in Spring/Summer. */
  seniorCap: number
}

export interface CoreItem {
  /** Unique: the course code, or the elective slot's `elective:<n>:<label>` code. */
  id: string
  named: boolean
  cu: number
  /** 1-4. 3 needs 30 cu passed first, 4 needs 60. */
  level: number
  seniorCmpt: boolean
  fullYear: boolean
  /** Term indices (into CoreInput.terms) it may be placed in: runs that season, not blocked, cap > 0. */
  allowed: number[]
  /** AND of OR over item ids still to be scheduled (groups already satisfied are dropped). */
  pre: { opts: string[]; concurrent: boolean }[]
  /** Credit rules still to meet, counted over passed courses per rule (a). */
  credit: CreditRule[]
  /** Advising year (L4). */
  year: number
  /** Requirement group order (L2/L5 sort key); lower first. */
  group: number
  /** Subject, for subject-filtered credit rules ('' for an elective slot). */
  subject: string
}

export interface CoreInput {
  items: CoreItem[]
  /** The horizon, in calendar order from the start term. Internship terms are present with cap 0. */
  terms: CoreTerm[]
  /** Courses passed before terms[0] (completed), for credit rules and the level gates. */
  done: { code: string; cu: number; level: number; subject: string }[]
  /** Booked courses: fixed; count as passed once their term (index) is over. -1 = before terms[0]. */
  booked: { code: string; term: number; cu: number; level: number; subject: string }[]
  /** Rule (e): no degree — assume each earlier Fall/Winter term full of other courses (cu per term). */
  assumedCuPerTerm?: number
  /** Deterministic search budget, in DFS nodes. */
  nodeBudget?: number
}

export type BindingKind = 'chain' | 'capacity' | 'season' | 'senior' | 'gate' | 'booked' | 'none'

export interface CoreResult {
  /** Term index per item (same order as CoreInput.items); null when no schedule was found. */
  at: number[] | null
  /** Index of the last term used by a planned item; -1 with nothing to place. */
  graduation: number
  lowerBound: number
  optimality: 'proven' | 'best-found' | 'infeasible'
  binding: { kind: BindingKind; detail: string; chain?: string[] }
  nodes: number
}

// ---- what the UI reads ----

export type DiagnosticCode =
  // errors: a course the plan cannot place under the hard rules
  | 'NO_OFFERING'
  | 'PREREQ_UNREACHABLE'
  | 'CYCLE'
  | 'STANDING'
  | 'SUMMER_ONLY'
  | 'HORIZON'
  // warnings
  | 'UNKNOWN_OFFERING'
  | 'AT_RISK'
  | 'BOOKED_OVER_LOAD'
  | 'EMPTY_SEAT'
  // override notes
  | 'RETAKE'
  | 'UNBOOKED'
  | 'BLOCKED'
  | 'OVERRIDE_INVALID'

export interface Diagnostic {
  level: 'error' | 'warning' | 'info'
  code: DiagnosticCode
  course?: string
  term?: string
  /** One plain sentence a student can read: "CMPT 400 needs Honours standing." */
  message: string
}

export interface PlanDiff {
  moved: { course: string; from: string; to: string; cause: string }[]
  added: { course: string; to: string; why: 'retake' | 'prerequisite' | 'alternative' | 'requirement' | 'elective'; cause: string }[]
  removed: { course: string; from: string; cause: string }[]
  swapped: { group: string; from: string; to: string; cause: string }[]
  graduation: { from: string | null; to: string | null; terms: number }
}
