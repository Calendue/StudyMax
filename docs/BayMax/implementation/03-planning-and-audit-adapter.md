# 03 — Planning & Audit Adapter

Implements just enough of spec `05`'s service functions (`generateRoadmap`, `regenerateRoadmap`,
`validateRoadmap`, `compareRoadmaps`) to make `run_scenario` and `commit_scenario` work for the demo,
by wrapping the *existing* deterministic planner instead of building spec `04`'s requirement-tree DSL
and bipartite audit algorithm. Put this in a new module, e.g. `src/lib/max/planningAdapter.ts`.

**Read `00-overview.md`'s fact #2 before this file** — this is a deliberate scope substitution, not an
oversight. Say so in the demo pitch.

## What the existing planner already guarantees, for free

`buildPlan`/`buildStudentPlan` (`src/lib/plan.ts`) never places a course before its unmet
prerequisites (`unmetPrerequisites` + `topologicalOrder`), and never exceeds `coursesPerTerm` in a term
(the `thisTerm.length === perTerm` cap, and the fallback batch is also sliced to `perTerm`). That means,
for this adapter, spec `05`'s `PREREQ_UNMET` and `OVER_LOAD` **cannot occur by construction** — you do
not need to write code to detect them. `NOT_OFFERED`, `EXCLUSION_CONFLICT`, `PROGRAM_RESTRICTED` also
don't apply: the current catalogue (`src/data/prereqs.ts`, `src/data/programs/computerScience.ts`) has
no offering calendar or exclusion data to check against. `validateRoadmap` in this adapter is
therefore intentionally close to a no-op — see below.

## Scoped-down `ScenarioOp` support for v1

The existing planner has no concept of a "pinned/planned course list" independent of specialization
targets — `selectCourses` derives the whole plan fresh from targets + the completed set every time.
Supporting `MOVE_COURSE`/`PIN_COURSE`/`ADD_COURSE`/etc. from spec `03`'s full op list would mean adding
real state the planner doesn't have. **Support only `DROP_COURSE` for the must-ship demo.**

This isn't an arbitrary cut — it maps naturally onto real planner behavior: `DROP_COURSE` on an
**in-progress** course is implemented by removing that code from the `inProgress` set passed into
`buildStudentPlan`. The course becomes unsatisfied again, and the planner naturally reschedules it —
and anything that depended on it — into a later term. This is exactly spec `06`'s real-world case
("dropping a current-term course ... the op is allowed, the committed result carries an INFO telling
the student to drop it with the registrar").

**Use `CMPT370` as the demo's fixed drop target, and the seeded student's `targetSpecializationIds`
must be `["software-development"]`** (→ `01-seed-demo-student.md` step 5) — this exact pairing was
verified by actually running `buildStudentPlan`, not assumed. It matters which specialization is
targeted: the strict "closest to finishing" specialization for this transcript (`social-computing`,
by `computeMatches`) has no path from any in-progress course to its one remaining requirement, so
`DROP_COURSE` against it is a silent no-op — confirmed by testing every specialization × in-progress-
course combination, not by inspection. Don't let the adapter (or anyone extending it) assume "drop any
in-progress course" works generically against "whatever the student is targeting" — for this seed data,
only the `software-development` + `CMPT370` pairing has a real, visible effect.

`RESTORE_VERSION` should also work (→ `04-scenarios-and-commits.md`'s undo/restore) since it just
re-runs this same adapter against an older `PlanVersion`'s snapshot inputs. Every other `ScenarioOp` →
reject with a speakable "I can't make that change yet" error from `run_scenario`, not a crash.

## Adapter functions

```ts
// src/lib/max/planningAdapter.ts

interface AdapterInput {
  completed: Set<string>       // from StudentCourse where status = "completed"
  inProgress: Set<string>      // from StudentCourse where status = "in_progress", minus any DROP_COURSE ops
  targetProgramId: string      // StudentProfile.majorProgramId, e.g. "computer-science"
  targetSpecializationIds: string[]
  coursesPerTerm: number       // ceiling (→ spec 03 decision 5) — ok to pass straight to buildPlan's existing perTerm cap
  start: TermStart
}

function regenerate(input: AdapterInput): { terms: PlannedTerm[] } {
  // Look up the Program by targetProgramId (src/data/programs/index.ts), resolve its specializations,
  // call computeMatches + buildStudentPlan exactly as the existing app does today. No new logic here —
  // this function's only job is translating AdapterInput into the shapes buildStudentPlan expects.
}

function validate(terms: PlannedTerm[]): ValidationResult {
  // v1: always { ok: true, issues: [] }. The planner's construction already rules out the ERROR
  // codes this catalogue could produce. If you want one real check for the demo's credibility, add
  // DEGREE_INCOMPLETE as a WARNING (not ERROR) by comparing terms' course set against
  // computeMatches' unsatisfied groups — optional, not required for must-ship.
}

function diff(before: PlannedTerm[], after: PlannedTerm[]): RoadmapDiff {
  // Compare the two PlannedTerm[] arrays by course code + term label:
  // - graduation: last term's label, before vs after
  // - added/removed: codes present in one array's terms but not the other
  // - moved: same code, different term label
  // - headline: build 1-3 short strings by template, e.g.
  //     `Graduation moves from ${from} to ${to}.` (only if changed, ranked first)
  //     `${n} course(s) shift to a later term.` (if moved.length > 0)
  //   This is exactly what spec 05's RoadmapDiff.headline asks for — templates in code, not an LLM call.
}
```

`generateRoadmap` (onboarding) already exists as `buildStudentPlan` — don't rename or wrap it for
onboarding's own use; this adapter is additive, only for the scenario/commit path (→ spec `07`:
`createRoadmap` → `generateRoadmap` is a rename for the spec's naming consistency, not a required code
change this weekend).

## Definition of done

- [ ] `regenerate({ ...seeded student's current state })` reproduces the same plan `01`'s seed script
      computed (determinism check — same inputs, byte-identical `terms`): one term,
      `Winter 2027: CMPT371, CMPT470`.
- [ ] `regenerate` with `CMPT370` removed from `inProgress` produces exactly: `Winter 2027: CMPT370`,
      `Fall 2027: CMPT371, CMPT470` — two terms, graduation pushed out by one term (verified against
      the real `buildStudentPlan`, not assumed — → `01-seed-demo-student.md` step 5).
- [ ] `diff(before, after)` for that change produces a non-empty `headline` (e.g. "Graduation moves
      from Winter 2027 to Fall 2027") and correct `moved` entries for `CMPT371`/`CMPT470`.
- [ ] `validate` never returns an `ERROR` for any plan this adapter can currently produce (true by
      construction — write one test asserting this rather than trusting it).
