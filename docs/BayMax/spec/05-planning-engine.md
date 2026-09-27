# 05 — Planning Engine

Covers the service functions `generateRoadmap` (was `createRoadmap`), `regenerateRoadmap`, `validateRoadmap`, `compareRoadmaps`, `checkDegreeCompletion`, `getRemainingRequirements`. All deterministic (I3).

## Inputs

```ts
PlannerInput {
  enrollment: ProgramEnrollment
  attempts: CourseAttempt[]
  requirements: RequirementNode        // for enrollment.catalogYear
  catalog: { courses, offerings, aliases }
  preferences: Preference[]            // enforceable ones only
  startTerm: TermCode                  // first term the planner may place courses in
  fixed: FixedPlacement[]              // pinned items; plus all past/current terms, which are immutable
  baseline?: RoadmapVersion            // present → minimal-perturbation mode
  horizonTerms: number                 // default 16; hard stop
}
```

Current-term courses (`in_progress`) are fixed and assumed passed for prerequisite purposes, with a flag carried into validation (`ASSUMES_IN_PROGRESS_PASS`).

## Output

```ts
PlannerOutput =
  | { status: "ok", version: RoadmapVersionDraft, warnings: ValidationIssue[] }
  | { status: "infeasible", reasons: InfeasibilityReason[], relaxations: Relaxation[] }
```

## Algorithm

### Step 1 — What's left

`audit(mode: including_in_progress)` → unsatisfied demands (→ 04).

### Step 2 — Choose courses to fulfill demands

For each unsatisfied demand, choose courses or emit a slot:

- `COURSE` → that course.
- `POOL` → if the student has an interest match (`interestTopics` vs. course subject/attributes/title tags) or a pinned course, pick specific courses; otherwise emit a **slot** with `eligibleCount`. Slots are the default for electives. Don't over-specify.
- `N_OF` → pick the child with the lowest total cost (courses needed + prerequisite depth), tiebreak by interest, then by code.
- Include any prerequisites of chosen courses not already satisfied (transitively).

Deterministic tie-breaking everywhere: final tiebreak is lexicographic course code.

### Step 3 — Schedule

Build the prerequisite DAG over chosen courses. Place term by term from `startTerm`:

- A course is placeable in term T if: its prereqs are satisfied by terms < T (or = T where `concurrentAllowed`), it's offered in T (`confirmed` or `projected`), coreqs can be placed in T, standing requirements are met by credits accumulated before T.
- Term capacity from `maxCoursesPerTerm` (a ceiling, not an exact fill — → 03 decision 5) / `maxCreditsPerTerm`. ~~Summer rules from `summerWillingness` / `maxSummerCourses`~~ — **cut for v1** (→ 03 decision 1); Fall/Winter only, no summer terms.
- Priority for placement: longest remaining prerequisite chain first (critical path), then courses that unlock the most others, then required-over-slot.
- Slots are placed after courses in the same priority band; a slot's eligible set must have at least one course offered in that term.
- `minCoursesPerTerm`: after placement, if a term is under minimum and there are unplaced slots/courses, pull forward; if nothing is left to place, report `UNDER_LOAD` warning (student may be finishing).
- `graduationPriority`:
  - `asap` → fill terms to capacity.
  - `on_time` → spread evenly to hit `graduationTarget`, don't exceed capacity.
  - `flexible` → prefer `loadPreference`.

### Step 4 — Minimal-perturbation mode (baseline present)

This is the default for every scenario (→ 06). Without it, a small what-if yields a wholesale reshuffle and `compareRoadmaps` becomes unreadable.

- Start from the baseline's placements.
- Apply the scenario's operations.
- Re-validate. For each item now invalid (prereq broken, not offered, over capacity), remove it and re-place it, plus anything transitively depending on it, using Step 3 rules starting from its original term.
- Items not invalidated stay where they are.
- Only if that yields infeasibility, fall back to full regeneration and set `regenerated: "full"` on the output, so Max can say "this required reworking your whole plan."

Objective in this mode, lexicographic: (1) hard constraints, (2) fewest moved items, (3) graduation term, (4) preferences.

### Step 5 — Validate

Always run `validateRoadmap` on the result before returning.

## Infeasibility

When no schedule meets hard constraints within `horizonTerms`, or `graduationTarget` can't be met:

```ts
InfeasibilityReason { code: string, detail: string, terms?: TermCode[], courses?: CourseCode[] }
Relaxation {
  id, label: string                  // "Allow up to 2 summer courses"
  change: ScenarioOp                 // applying it = a scenario op (→ 06)
  effect: { graduation?: TermCode }  // precomputed
}
```

Generate relaxations by re-running the planner with one lever changed at a time (load +1, graduation +1 term, drop `avoidCourses` constraint — ~~summer light, summer full~~ cut with summer terms, → 03 decision 1). Return the ≤ 3 that succeed with the smallest change. Cap total planner runs per request at 8.

## validateRoadmap

Returns `ValidationResult { ok: boolean, issues: ValidationIssue[] }`. `ok` is false iff any issue is `ERROR`.

```ts
ValidationIssue { code, severity: "ERROR" | "WARNING" | "INFO", term?, courseCode?, message }
```

| code | severity | meaning |
|---|---|---|
| PREREQ_UNMET | ERROR | course placed before prereqs |
| COREQ_UNMET | ERROR | |
| NOT_OFFERED | ERROR | no offering (confirmed or projected) in that term |
| OVER_LOAD | ERROR | exceeds hard max |
| UNDER_LOAD | WARNING | below `minCoursesPerTerm` |
| EXCLUSION_CONFLICT | ERROR | both sides of an antirequisite |
| DUPLICATE_COURSE | ERROR | same course twice without repeat intent |
| PAST_TERM_MODIFIED | ERROR | edits to a past or current term |
| DEGREE_INCOMPLETE | ERROR | audit(including_planned) not complete |
| PROJECTED_OFFERING | WARNING | relies on historical-pattern offering |
| ASSUMES_IN_PROGRESS_PASS | INFO | depends on current courses being passed |
| UNVERIFIABLE_PREREQ | WARNING | e.g. instructor permission |
| MANUAL_CHECK_PENDING | WARNING | program has manual-check nodes |
| GRADUATION_TARGET_MISSED | WARNING | soft target not met |
| PROGRAM_RESTRICTED | ERROR | course restricted to other programs |

Commits (→ 06) are blocked by any `ERROR`. `WARNING`s must be included in what Max says or the app shows before commit.

## compareRoadmaps → RoadmapDiff

```ts
RoadmapDiff {
  graduation: { from?: TermCode, to?: TermCode, deltaTerms: number }
  added:   { item, term }[]
  removed: { item, term }[]
  moved:   { item, from: TermCode, to: TermCode }[]
  slotResolved: { slotLabel, courseCode, term }[]
  loadByTerm: { term, from: number, to: number }[]   // only changed terms
  requirementChanges: { nodeLabel, from: status, to: status }[]  // e.g. program change
  newIssues: ValidationIssue[]
  resolvedIssues: ValidationIssue[]
  regenerated: "minimal" | "full"
  headline: string[]    // ≤ 3 facts ranked for speech, generated by code
}
```

`headline` ranking: graduation change > new ERROR/WARNING > number of moved courses > load changes. Generated by templates in code, e.g. `"Graduation moves from Spring 2029 to Fall 2029."`, `"3 courses shift one term later."` Max phrases around these; it does not recompute them.

## getRemainingRequirements

Thin wrapper: `audit(mode: including_in_progress)` → list of unsatisfied/partial nodes with `remaining` and a plain-language label per node. Used by the degree-audit skill (→ 08).

## Performance budgets

Voice makes these hard requirements, not nice-to-haves (→ 09):

| Operation | p95 |
|---|---|
| audit | 50 ms |
| minimal-perturbation regenerate + validate + diff | 400 ms |
| full regenerate | 1.5 s |
| infeasibility with relaxations (≤ 8 runs) | 2.5 s |

## Acceptance criteria

- Same `PlannerInput` → byte-identical output (hash-checked in CI).
- Every roadmap returned with `status: ok` passes `validateRoadmap` with zero ERRORs.
- Golden-fixture suite: ≥ 20 student fixtures per pilot program with expected graduation term and zero ERRORs.
- Minimal-perturbation: dropping one leaf course (nothing depends on it) moves ≤ 1 other item in ≥ 95% of fixture cases.

## Decisions and rejected alternatives

- **Rejected: LLM generates the plan.** Can't guarantee prereq correctness; can't reproduce; can't diff reliably.
- **Rejected: full ILP solver in v1.** Probably the right long-term answer for optimality, but heuristic + validation is faster to ship and easier to explain. Keep the planner behind an interface.
- **Rejected: always specific courses, no slots.** Over-specified plans churn whenever a student changes an elective and make the diff noisy.
