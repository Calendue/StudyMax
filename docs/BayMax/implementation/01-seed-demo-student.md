# 01 — Seed the Demo Student

Do this first. Every later step (`02`–`06`) needs one real, stable `userId` to build and test against,
and the app has no server-side write path to create one (→ `00-overview.md`, persistence gap).

## Why reuse the existing sample transcript

`src/data/transcript.ts` already holds a real, de-identified USask CS transcript
(`completedCourses`, `inProgressCourses`) — it's the data behind "Load a sample student," the
existing hackathon demo's bulletproof fallback (per `CLAUDE.md`: "the demo's safety net — it must
never break"). Seeding the DB with the *same* data means the Max demo and the existing sample-student
demo tell a consistent story, and there's no new data-authoring risk.

## What to create

A new script, `scripts/seed-demo-student.ts`, following the pattern in `scripts/seed-institutions.ts`
(same `PrismaClient` + `node --experimental-strip-types --env-file=.env.local` invocation). Add
`"db:seed:demo-student": "node --experimental-strip-types --env-file=.env.local scripts/seed-demo-student.ts"`
to `package.json`.

Steps the script performs, idempotently (upsert by a fixed known email, so re-running it doesn't
duplicate rows):

1. **Look up the University of Saskatchewan `Institution` row** (already seeded by
   `npm run db:seed:institutions` — query by `name`, don't hardcode an assumed ID).
2. **Upsert `UserInfo`** with a fixed `authUid` (e.g. `"baymax-demo-student"` — not a real Firebase
   uid, this user never logs in through Firebase) and a recognizable name/email for anyone reading
   the DB later (e.g. `demo@baymax.studymax.internal`).
3. **Upsert `StudentProfile`**: `studentType: "existing"`, `institutionId` from step 1,
   `degree: "Bachelor of Science"`, `majorProgramId: "computer-science"` (matches
   `src/data/programs/computerScience.ts`'s `id`), no minor/concentrations unless you want to exercise
   that path too, `goals: null`.
4. **Upsert `StudentCourse` rows**: one row per code in `completedCourses` (status `"completed"`) and
   one per code in `inProgressCourses` (status `"in_progress"`) from `src/data/transcript.ts`. Import
   that file directly — don't hand-copy the course list.
5. **Target `"software-development"`, not the strict closest-match specialization — verified by
   actually running the planner, not inferred.** `buildStudentPlan(targets, ...)` only plans courses
   for specializations passed in as `targets`; an empty `targets` array produces an **empty plan**
   (`open.length > 0 ? buildPlan(...) : []`, in `src/lib/plan.ts`), so `targetSpecializationIds` must
   not be left empty. The obvious choice — computing the real "hero" the way `src/App.tsx` does
   (`computeMatches(computerScience.specializations, completed)`, take `matches[0]`) — gives
   `"social-computing"`, ranked closest by `completed`-only remaining count. **Don't use it**: I ran
   `buildStudentPlan` against it directly, and its one remaining requirement (`CMPT412`) has no
   dependency on any course in `inProgressCourses`, so `DROP_COURSE` on anything in-progress produces
   a byte-identical plan — a demo dead end that would only surface once someone tried it live on
   stage. I then ran every (specialization × in-progress-course) combination through the real
   `buildStudentPlan` looking for one with a visible effect, and confirmed this one works cleanly:

   - `targetSpecializationIds: ["software-development"]` (remaining: 3, by `completed`-only count —
     a reasonable "close to finishing" story, not the literal closest one).
   - Its requirements directly include `CMPT370` (`{ courses: ["CMPT370"], need: 1 }` in
     `src/data/specializations.ts`) — the same course already sitting in the seeded student's
     `inProgressCourses`.
   - **Superseded 2026-09-27** — the seed now plans the whole degree at 5 a term through
     `planningAdapter.regenerate()`; current numbers are in `docs/BayMax/HANDOFF.md` ("Demo student").
     The historical record below is kept as it was.
   - Confirmed output, next Winter as `start`: **before** = one term (`Winter 2027: CMPT371, CMPT470`).
     **After** dropping `CMPT370` from in-progress = two terms (`Winter 2027: CMPT370`;
     `Fall 2027: CMPT371, CMPT470`) — graduation genuinely pushes out a term. This is the exact
     "what if I drop CMPT 370" / "graduation moves from Winter 2027 to Fall 2027" demo moment spec
     `08`'s own example dialogue describes — use `CMPT370` as the fixed demo drop target
     (→ `03-planning-and-audit-adapter.md`).
6. **Compute and upsert `GeneratedPlan`**: call the *existing* `buildStudentPlan` from
   `src/lib/plan.ts` with the `software-development` specialization (from step 5) as the sole `targets`
   entry, the completed/in-progress sets from step 4, `coursesPerTerm: 4` (already a ceiling in
   `buildPlan`, not an exact fill — no planner change needed, → spec `03` decision 5), and `start` = next Winter
   term after "today" (`upcomingTerm(new Date())` from `src/lib/plan.ts`, or hardcode `Winter 2027` to
   match the verified numbers above exactly). Store the result as `terms` (JSON) — it should match the
   "before" plan above verbatim — plus `targetProgramId: "computer-science"`,
   `targetSpecializationIds: ["software-development"]`, `version: 1`.
7. **Insert the matching `PlanVersion` v1** in the same transaction, `createdBy: "backfill"` (→ spec
   `03`'s `PlanVersion` model and `02-database-migration.md`, which must land before this step can
   write it — do `02` first if you're going strictly in order, or write this script now and run it
   after `02`'s migration is deployed).

## What NOT to build here

No onboarding UI changes, no Firebase-auth-to-`UserInfo` bootstrap, no general "save this student"
endpoint. This script is the only way this demo student's core academic record gets into the DB. If
you need a second demo student later, extend the script rather than building general infrastructure.

## Definition of done

- [ ] `npm run db:seed:demo-student` is idempotent (running it twice doesn't duplicate rows or error).
- [ ] Querying the DB (`npm run db:studio`) shows one `UserInfo` with a full `StudentProfile`, ~35
      `StudentCourse` rows matching `src/data/transcript.ts`, and a `GeneratedPlan` with a real
      multi-term `terms` array.
- [ ] The generated plan is one `buildStudentPlan` would actually produce today for this transcript —
      don't hand-write the `terms` JSON.
