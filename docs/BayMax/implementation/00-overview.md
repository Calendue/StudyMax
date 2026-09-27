# BayMax Implementation — Overview

Read this file first, in a fresh session, before touching code. It exists so that session doesn't have
to re-derive the decisions already made in `docs/BayMax/spec/` (all nine files, plus this folder) —
read the spec files too, they now carry the resolved decisions inline (search each for "RESOLVED").

## What we're building this weekend

One real, live, end-to-end demo: a phone call from **Max**, a Vapi voice agent, that reads a real
student's plan from the database, proposes a change ("what if I drop CMPT 370"), and — on a clear
yes — commits it as a new plan version. Everything else in the spec is a stretch goal or explicitly
deferred (→ `07-post-hackathon-backlog.md`).

The demo's one verified scenario (→ `01-seed-demo-student.md`, `03-planning-and-audit-adapter.md`):
seeded student targets the `software-development` specialization, currently plans to graduate after
one more term (`Winter 2027: CMPT371, CMPT470`); dropping the in-progress `CMPT370` genuinely pushes
graduation to `Fall 2027`. This exact pairing was confirmed by running the real planner, not assumed —
other specialization/course combinations for this same transcript produce no visible change at all, so
don't substitute a different "what if I drop X" example without re-running that check.

**Must-ship tools** (only these four): `get_student_overview`, `run_scenario`, `discard_scenario`,
`commit_scenario`. **Must-ship skills** (→ spec `08`): S1 (opening), S2 (summarizeRoadmap), S5
(whatIf), S7 (manageRoadmap + confirmation protocol).

## Build order (each file below is one step; do them in order)

1. `01-seed-demo-student.md` — a real row set to build and demo against. Do this before anything else;
   every later step needs a real `userId` to test with.
2. `02-database-migration.md` — the new Prisma models (`MaxSettings`, `Scenario`, `PlanVersion`, etc.),
   migrated with `prisma migrate deploy` per `CLAUDE.md`'s rule (never `migrate dev` — no shadow DB,
   one shared remote Supabase instance four people hit).
3. `03-planning-and-audit-adapter.md` — the deterministic engine `run_scenario` calls. Wraps the
   *existing* `src/lib/plan.ts` / `src/lib/match.ts` / `src/data/programs/computerScience.ts` rather
   than building spec `04`'s full requirement-DSL/audit engine from scratch.
4. `04-scenarios-and-commits.md` — `Scenario` lifecycle, `commitScenario` with the confirmation-hash
   check, `PlanVersion` history.
5. `05-agent-tool-gateway.md` — the webhook endpoint Vapi calls, identity resolution from the Vapi
   call ID (I6: never a `studentId` parameter), the four tool implementations.
6. `06-vapi-voice-integration.md` — Vapi assistant config, the system prompt (S1/S2/S5/S7 only), phone
   verification (real Firebase Phone Auth), consent, and the "Ping Max" entry point in the app.
7. `07-post-hackathon-backlog.md` — not a build step. Read it once so you know what to explicitly
   *not* build, and don't accidentally scope-creep into spec `04`'s full DSL or the eval suites in `12`.

## Two facts that reshape the spec's assumptions — read before step 1

### 1. There is no persistence layer yet

The Prisma schema (`UserInfo`, `StudentProfile`, `StudentCourse`, `GeneratedPlan`, `Institution`,
`Major`) is migrated onto the shared Supabase instance, but **no application code reads or writes it**.
`@prisma/client` is only imported in `scripts/seed-institutions.ts` and `scripts/seed-majors.ts`. The
live app is still 100% localStorage for student data — onboarding never writes to the DB.

**Resolution** (→ spec README): don't build general onboarding→DB persistence this weekend. Seed one
demo student directly (`01-seed-demo-student.md`). Max's tools and every new BayMax table point only
at that seeded user. Onboarding's UI and localStorage path are untouched.

### 2. The existing planner already works for USask CS — reuse it

`src/lib/plan.ts` (`buildPlan`, `buildStudentPlan`, `selectCourses`, `withPrerequisites`,
`topologicalOrder`), `src/lib/match.ts` (`computeMatches`, `computeCourseOverlap`), and
`src/lib/credentials.ts` already do real prerequisite-aware planning against
`src/data/programs/computerScience.ts` and `src/data/prereqs.ts` (scraped from
`catalogue.usask.ca`). Spec files `04` and `05` describe a much larger requirement-tree DSL and
bipartite-matching audit engine — that's real, multi-day work (the spec says so itself: "a single
major... can be days of careful authoring"). Building it from scratch this weekend instead of reusing
what already works would blow the whole timeline for no demo-visible benefit.

**Resolution**: `03-planning-and-audit-adapter.md` wraps the existing functions to produce the shapes
spec `05`/`06` need (`PlannerOutput`, `ValidationResult`, `RoadmapDiff`), instead of implementing
`04`'s `RequirementNode` tree and bipartite-audit algorithm. This is a deliberate, scoped-down
substitution — flag it in the demo pitch as "the audit engine gets rebuilt properly post-hackathon,"
don't present it as `04` fully implemented.

## Definition of done for the weekend

- [ ] One seeded demo student exists in the shared DB with a realistic partial USask CS transcript.
- [ ] Tapping "Ping Max" in the app places a real Vapi call to a verified phone number.
- [ ] On that call, asking "what's my plan" gets a spoken, accurate answer sourced from `get_student_overview`.
- [ ] Asking "what if I drop CMPT 370" triggers `run_scenario`, and Max speaks a correct headline
      ("graduation moves from Winter 2027 to Fall 2027").
- [ ] Saying "yes" triggers `commit_scenario`, which writes a new `PlanVersion` and updates `GeneratedPlan`.
- [ ] Saying "no" / discarding leaves the official plan untouched (`discardScenario`).
- [ ] None of this can be triggered without phone verification + consent (real Firebase Phone Auth OTP, not stubbed).
- [ ] The existing Bland "Call me now" flow (`CallScreen.tsx`, `api/call-me.ts`) still works, untouched, gated behind its own feature flag as a fallback.
- [ ] `npm run lint && npm run build` pass.

## Who owns what (fill in when you start)

The spec assumes team alignment already happened; this implementation folder doesn't re-litigate that.
Whoever picks this up: post in the team channel before running the migration (→ `02`), since it's a
schema change on the one shared Supabase instance all four people use.
