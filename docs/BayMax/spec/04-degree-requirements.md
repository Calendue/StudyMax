# 04 — Degree Requirements, Prerequisites, and Audit

## Why this file matters most

Every downstream answer Max gives — "you're on track," "dropping this delays you a term" — is only as correct as this layer. The original architecture treats "Degree DB" as a box. It is the hardest part of the product and the critical path for the pilot.

## Requirement tree

A program's requirements are a tree of nodes. The DSL must express everything in the pilot institution's calendar for the pilot programs; anything it can't express is logged as a `manual_check` node rather than approximated.

```ts
RequirementNode =
  | { type: "ALL_OF", id, label, children: RequirementNode[] }
  | { type: "N_OF",   id, label, n: number, children: RequirementNode[] }       // choose n child nodes
  | { type: "COURSE", id, courseCode, minGrade?: string }
  | { type: "POOL",   id, label,
      select: CourseSelector,          // which courses qualify
      need: { courses?: number, credits?: number },
      minGrade?: string,
      maxFromSubject?: { subject: string, credits: number }[] }
  | { type: "CONSTRAINT", id, label, rule: ConstraintRule }
  | { type: "MANUAL_CHECK", id, label, description: string }   // shown, never auto-satisfied

CourseSelector = {
  codes?: CourseCode[]
  subjects?: string[]
  levelMin?: number, levelMax?: number
  attributes?: string[]
  exclude?: CourseCode[]
}

ConstraintRule =
  | { kind: "max_credits_at_level", level: number, credits: number }     // e.g. max 42 CU at 100-level
  | { kind: "min_credits_at_or_above_level", level: number, credits: number }
  | { kind: "min_program_gpa", gpa: number, scope: "major" | "all" }
  | { kind: "residency", minCreditsAtInstitution: number }
  | { kind: "total_credits", credits: number }
```

### Sharing (double counting)

Each node has `shareable: "none" | "within_program" | "across_programs"`, and each `Program` declares a default. The auditor must know whether a course can satisfy both a major requirement and a minor requirement. This is institution policy, and USask's actual calendar text for it still needs confirming — **RESOLVED default for v1**: `within_program`. A course can satisfy multiple nodes inside the same program's tree, but is never shared across major+minor unless a node explicitly says otherwise. Under-crediting a student is a safer wrong answer than telling them they're closer to done than their real audit would say.

### Example (illustrative, not real data)

```yaml
type: ALL_OF
label: B.Sc. Computer Science (2025-2026)
children:
  - { type: COURSE, courseCode: "CMPT 141" }
  - { type: COURSE, courseCode: "CMPT 145", minGrade: "C" }
  - type: POOL
    label: "Senior CMPT"
    select: { subjects: [CMPT], levelMin: 300 }
    need: { credits: 18 }
  - type: N_OF
    label: "Math foundation"
    n: 1
    children:
      - { type: COURSE, courseCode: "MATH 110" }
      - { type: COURSE, courseCode: "MATH 133" }
  - type: CONSTRAINT
    label: "Max 100-level"
    rule: { kind: max_credits_at_level, level: 100, credits: 42 }
```

## Prerequisites

Same boolean shape, different leaves:

```ts
PrereqExpr =
  | { op: "AND" | "OR", args: PrereqExpr[] }
  | { course: CourseCode, minGrade?: string, concurrentAllowed?: boolean }
  | { standing: { minCredits?: number, minYear?: number } }
  | { program: { anyOf: string[] } }          // "restricted to CS majors"
  | { unverifiable: string }                  // "permission of instructor"
```

- `concurrentAllowed` models "prerequisite or corequisite."
- `unverifiable` leaves never block; they produce a `WARNING` (→ 05) so Max can say "this needs instructor permission."
- Exclusions (antirequisites) live on `Course.exclusions`: taking both → the second gives no credit.

## Catalog year handling (I5)

- Program requirements are looked up by `(programId, catalogYear)` **once the static catalogue is versioned** (→ 03, decision 3). Until then there is one edition and I5 is knowingly violated for continuing students.
- Course prerequisites are looked up by the **term the course is taken** (prereqs change year to year and apply when you enroll), unless the institution says otherwise. Make this an `Institution` flag.
- Course aliases (→ 03) resolve old completions against new requirement codes.

## Audit algorithm

Input: requirement tree, effective course attempts (completed + transfer + optionally in_progress/planned), sharing rules. Output: `AuditResult`.

Assigning courses to requirements is a matching problem: one course could satisfy several nodes but may only count toward one (unless shareable). Greedy assignment in tree order gives wrong answers (a course consumed by a broad pool that was the only option for a specific requirement).

v1 approach:

1. Expand the tree to leaf demands (COURSE, POOL).
2. Build a bipartite graph: attempts ↔ demands they can satisfy (respecting minGrade).
3. Most-constrained-first: satisfy demands with the fewest eligible attempts first; within ties, assign the attempt with the fewest alternative uses.
4. For pools with credit needs, fill with the smallest-sufficient set.
5. Evaluate `N_OF` and `ALL_OF` bottom-up; evaluate `CONSTRAINT` nodes on the final assignment.
6. If a demand is unsatisfied but a reassignment would satisfy it without breaking another, perform it (bounded augmenting-path search; the graph is small, a few hundred edges).

If fixtures show greedy + augmentation fails real cases, switch to an ILP/max-flow formulation. Keep the auditor behind an interface so this is swappable.

```ts
AuditResult {
  nodes: Record<nodeId, {
    status: "satisfied" | "partial" | "unsatisfied" | "manual_check"
    assigned: { attemptId, courseCode, credits }[]
    remaining?: { courses?: number, credits?: number, eligibleCodes?: CourseCode[] }
  }>
  complete: boolean
  warnings: ValidationIssue[]
  mode: "completed_only" | "including_in_progress" | "including_planned"
}
```

`including_planned` is how `checkDegreeCompletion` works on a proposed roadmap: audit completed + in-progress + all planned items (slots count as satisfying their node if `eligibleCount > 0`).

## Getting the data in (authoring pipeline)

Requirement data is **authored, reviewed, published**. Never have the LLM interpret calendar text at runtime.

1. Scrape or copy calendar pages for the pilot programs and the catalog year(s) needed.
2. LLM-assisted draft into the DSL (offline tool), with every node linking back to source text.
3. Human review in an authoring UI showing source text beside nodes.
4. Each program ships with **≥ 5 fixture students** (hand-worked transcripts with expected audit output: one on track, one missing a pool, one with a double-count edge, one with a repeat, one with transfer credit).
5. `published` only when fixtures pass.
6. Every published program carries `sourceUrl` + `retrievedAt`.

Budget realistically: a single major with a handful of concentrations can be days of careful authoring. Pick the pilot program set small.

## Acceptance criteria

- 100% of authored fixtures pass for every published program.
- Every calendar rule in pilot programs is either expressed in the DSL or present as a `MANUAL_CHECK` node; none silently dropped.
- Audit of a 40-course record completes in < 50 ms.

## Decisions and rejected alternatives

- **Rejected: LLM reads calendar text at query time.** Untestable, and the output is the thing students make decisions from.
- **Rejected: flat checklist of required courses.** Can't express pools, choose-N, level caps, or double counting — i.e. most real degrees.
- **Rejected: greedy tree-order assignment.** Known to misassign; see step 3 rationale.
