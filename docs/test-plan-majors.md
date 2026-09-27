# Test plan — every major, not just CS

**Goal:** before the demo, prove that onboarding, matching, planning, the roadmap and awards behave for every program in `src/data/programs/index.ts`, not only Computer Science. Today every behavioural check (`check-plan`, `check-match`, `check-credentials`) runs on CS data only. Only `check-new-programs.ts` loops over the other programs, and it checks data shape, not planner behaviour.

**Rules (from CLAUDE.md):**
- Plain `node:assert` scripts in `scripts/check-*.ts` only. No new test framework.
- Everything runs with `for f in scripts/check-*.ts; do node --experimental-strip-types "$f"; done && npm run lint && npm run build`.

**Owner:** TBD. Steps 0–1 can start immediately; step 2 needs someone who knows the programs; step 3 needs phones.

---

## Snapshot of the data (working tree, 2026-09-26 evening)

Several program files and `src/data/prereqs.ts` were uncommitted teammate work when this was written. Re-run the numbers before trusting them.

| program id | kind | specs | groups per spec | unique codes | codes without prereq data | codes not in scraped catalogue | same code in 2 groups of one spec |
|---|---|---|---|---|---|---|---|
| computer-science | major | 12 | 6–8 | 43 | 2 | CMPT435, BINF451 | – |
| applied-mathematics | major | 1 | 11 | 36 | 5 | MATH123, MATH124, MATH452, MATH465, MATH485 | – |
| physics | major | 1 | 11 | 48 | 0 | – | – |
| applied-computing | major | 3 | 16–18 | 69 | 2 | MATH325, GEOG125 | data-analytics: MATH238/313/314/325/327, STAT344/345/448 |
| computing-certificate | certificate | 1 | 7 | 19 | 0 | – | – |
| mathematical-modelling-certificate | certificate | 1 | 10 | 34 | 1 | MATH325 | – |
| formal-reasoning-certificate | certificate | 1 | 7 | 9 | 0 | – | – |
| astronomy-certificate | certificate | 1 | 3 | 14 | 0 | – | – |
| statistics-minor | minor | 1 | 6 | 19 | 0 | – | – |
| math | major | **0 (stub)** | – | – | – | – | – |
| statistics | major | **0 (stub)** | – | – | – | – | – |
| biology | major | 1 | 9 | 69 | 0 | – | – |
| psychology | major | 1 | 10 | 50 | 0 | – | – |
| engineering | major | 8 | 52–53 | 188 | 0 | – | – |
| nursing | major | 1 | 36 | 105 | 0 | – | – |
| agriculture | major | 3 | 23–30 | 217 | 0 | – | agribusiness: POLS328 |
| commerce | major | 3 | 25–31 | 67 | 0 | – | – |
| kinesiology | major | 1 | 19 | 55 | 0 | – | – |
| education | major | 2 | 20–22 | 52 | 0 | – | – |

To regenerate this table, run a throwaway script over `programs`, `catalogueCourses` (`src/data/courses.ts`) and `courseInfo` (`src/data/prereqs.ts`). Step 1's script prints it as a report.

### Known engine limits (not bugs to fix this weekend, but tests must know about them)

- **Double counting.** `computeMatches` (`src/lib/match.ts`) scores each requirement group on its own. A course listed in two groups of one spec counts toward both, so applied-computing data analytics and agriculture agribusiness can show fewer remaining courses than is true. Decide per case whether to fix the data or accept it.
- **Fall/Winter only.** `nextTerm` in `src/lib/plan.ts` has no Spring/Summer, so nursing's Year 3 spring term and engineering's fixed first-year split aren't modelled.
- **Credit units as course counts.** Several programs approximate "N credit units" as `need = N / 3` (physics, kinesiology, commerce finance, agriculture). Labs and 6-cu courses will be off by a little.
- **Stubs.** `math` and `statistics` majors have no specializations and must go down the scholarships-only path cleanly.
- **Big plans.** Engineering (8 specs × 52+ groups) and agriculture produce plans of 40–60 courses. That is a phone-layout risk and a performance risk.

---

## Step 0 — keep the safety net honest

`scripts/check-course-codes.ts` currently mixes two questions: does this code exist, and do we have prereq data for it. It failed earlier today (at ARCH112, mechanical engineering) and passes again only because the data was edited. Split it:

- **(a) FAIL** if a program references a code that is neither in `catalogueCourses` nor in a short pinned allowlist, with a reason per code (for example "retired, still named on program page"). The codes in the table above need to be fixed or allowlisted.
- **(b) REPORT, non-fatal**: per-program prereq coverage, so a teammate adding a program sees how much of the planner's ordering is real.

## Step 1 — `scripts/check-all-programs.ts` (new)

The script loops every program × specialization × synthetic student and asserts invariants using the existing functions only:
- `computeMatches`, `computeCourseOverlap` (`src/lib/match.ts`)
- `buildStudentPlan`, `buildPlan`, `selectCourses`, `termsFrom`, `upcomingTerm` (`src/lib/plan.ts`)
- `computeCredentials` (`src/lib/credentials.ts`)
- `buildRoadmapLayout` (`src/lib/roadmapLayout.ts`)

### Synthetic students

Deterministic, using a tiny seeded PRNG (about 5 lines, no dependency), for each spec:

1. **Empty.** First-year, nothing done.
2. **25% / 50% / 75%.** A random subset of the spec's required codes completed.
3. **One short.** Everything done except one group missing one course.
4. **All done.** Every group satisfied.
5. **In-progress mix.** A 50% student with 3 further required codes marked in-progress.
6. **Off-program courses.** A 50% student plus 5 random catalogue codes from other subjects. These must not break anything.

Every case runs with `coursesPerTerm` 1–4 and two start terms (`upcomingTerm(today)` and a Winter start).

### Data invariants (per group)

- Group is non-empty and `1 ≤ need ≤ courses.length`.
- Every code matches `^[A-Z]+\d+$` and is in the catalogue or the Step 0 allowlist.
- A duplicate code across groups of one spec produces a warning, not a failure (see the limits above).

### Engine invariants (per student × spec)

| # | Invariant | Catches |
|---|---|---|
| 1 | `remaining === Σneed − satisfied` and `remaining ≥ 0` | scoring bugs |
| 2 | All-done student → `buildStudentPlan(...)` returns `[]` | phantom work |
| 3 | No completed **or in-progress** code appears in the plan | re-planning a finished or current class |
| 4 | No code appears twice in the plan | double scheduling |
| 5 | Every term has `≤ coursesPerTerm` courses | cap ignored |
| 6 | Term labels start at the chosen start term and follow `termsFrom` order | start-term bug |
| 7 | For every planned course with prereq data, each AND-group has an option that is completed, in-progress, or in a **strictly earlier** term (unless the course is in the "unreadable/cyclic" tail `topologicalOrder` emits last; log those) | ordering bugs |
| 8 | **Coverage:** `computeMatches([spec], done ∪ inProgress ∪ planned)` → `remaining === 0` | silent slot shortfall in `selectCourses` when every option was taken by another slot |
| 9 | `computeCredentials(programs, done, program.id)` never includes `program.id`, and only returns certificate/minor | self-credit |
| 10 | Roadmap: every edge's endpoints are nodes; every planned course has a node | broken graph on screen |
| 11 | **Joint targets:** all specs of a program planned together (engineering's 8) terminates, satisfies #3–#8, and takes < 200 ms | combinatorics and performance |
| 12 | Determinism: the same input run twice gives an identical plan | flaky demo |

The script prints the Step 0 coverage table at the end, plus a summary line per program (`engineering: 8 specs × 9 students × 8 settings ok, 3 warnings`).

## Step 2 — fixture students with pinned expectations

`scripts/fixtures/students.ts` holds one realistic, hand-written mid-degree student per data-backed major (CS reuses `src/data/transcript.ts`). Write them from a real program page's year-2/3 course list, not randomly.

- `check-all-programs.ts` pins 2–3 facts per fixture, the way `check-match.ts` does for CS: the closest spec id, its `remaining`, and one expected planned course.
- These fixtures become "Load a sample student" for other majors later (see `win-features.md` #4). That is demo breadth in one tap.

## Step 3 — manual QA checklist (phone first)

Run it on **iOS app, Android app, and mobile web** (plus one desktop pass). Use one row per major; tick each cell or write the bug.

| Major | Onboarding pick | Courses: search + browse | Reveal lines sensible | Overview numbers match plan | Plan: change start term | Plan: per-term 1→4 | Plan: add target | Roadmap readable | Awards list + "why you" | Call screen shows only if features on | Refresh keeps state |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Computer Science (+ sample) | | | | | | | | | | | |
| Applied Mathematics | | | | | | | | | | | |
| Physics | | | | | | | | | | | |
| Applied Computing | | | | | | | | | | | |
| Biology | | | | | | | | | | | |
| Psychology | | | | | | | | | | | |
| Engineering | | | | | | | | | | | |
| Nursing | | | | | | | | | | | |
| Agriculture | | | | | | | | | | | |
| Commerce | | | | | | | | | | | |
| Kinesiology | | | | | | | | | | | |
| Education | | | | | | | | | | | |
| Mathematics (stub) | | | n/a | n/a | n/a | n/a | n/a | n/a | | | |
| Statistics (stub) | | | n/a | n/a | n/a | n/a | n/a | n/a | | | |

**Cross-cutting checks** (once per platform):

- [ ] Stub majors: no empty cards, no "0 courses away from your program", awards still work.
- [ ] Engineering and nursing long plans scroll smoothly; roadmap pans and nothing overflows horizontally.
- [ ] No course shows as a bare code (a title always resolves); catalogue links never 404 (spot-check 5 per major).
- [ ] First-year vs existing student: first-year skips upload and reveals straight away.
- [ ] Minor and concentration chosen in onboarding appear as plan targets; removing one works.
- [ ] Guest vs signed in (Google/Apple): state survives sign-out and sign-in per account.
- [ ] Airplane mode: sample student, plan and roadmap still work; AI and call features show friendly errors, not spinners.
- [ ] Android back button walks back through screens and never exits mid-flow.
- [ ] **CS sample path clicked end to end. This is the demo safety net.**

## Release gate (before anything is merged to `main` or demoed)

1. `for f in scripts/check-*.ts; do node --experimental-strip-types "$f"; done` — all green, including `check-all-programs.ts`.
2. `npm run lint && npm run build` are green.
3. The CS sample path works on a real phone.
4. The QA table has no open cells for the majors you plan to show judges.
