# Database spec

Implemented in `prisma/schema.prisma`, migrated and seeded on the remote Supabase Postgres. This doc explains what each table is for and why — `prisma/schema.prisma` is the source of truth for exact column types/constraints; don't let this drift from it.

Auth is **Firebase** (`src/auth.ts` — one module, native Capacitor sign-in on iOS/Android and the Firebase JS SDK on web, Google/Apple, with a "continue as guest" fallback) — not Clerk. `UserInfo.authUid` holds an `Account.uid`.

## How the app uses it

`api/session.ts` is the only route that touches the database. The app sends the signed-in student's Firebase ID token; the route verifies it against Google's public keys (`api/_firebaseAuth.ts`) and reads or writes by that uid.

- **PUT** (a second and a half after each change while signed in): upserts `UserInfo` (with `phoneNumber` once they've typed one), replaces the student's `StudentCourse` rows with their completed, in-progress and registered codes, and upserts `StudentProfile` once onboarding has reached the results (deleted again on a reset). A profile needs an `Institution`, so only USask students get one today.
- **GET** (at launch or sign-in, only when the phone has no saved session for that uid): the app fills its state from what's stored.
- The app is local-first: localStorage is what it runs from, and every DB failure is silent. It only saves after a GET got an answer (or the phone has its own save), so an unreachable DB never overwrites a stored session with an empty one. Two phones used at once are last-writer-wins.
- `GeneratedPlan` isn't written: the plan is recomputed deterministically from the profile and courses.

## Tables

### `UserInfo`
The account row, one per signed-in student.

| Column | Type | Notes |
| --- | --- | --- |
| `userId` | `BigInt` id | |
| `authUid` | `String` unique | Firebase uid (`Account.uid`) |
| `firstName`, `lastName`, `email` | `String?` | from the Firebase profile |
| `phoneNumber` | `String?` | onboarding's phone step, for Max's call. Signed-in students only; a guest's never leaves the device. An empty field in a save leaves the stored one as is |
| `createdAt`, `updatedAt` | `DateTime` | |

Relations: one `StudentProfile`, many `StudentCourse`, one `GeneratedPlan`.

Guests (no account) never get a `UserInfo` row — "continue without an account" / "skip onboarding" both work with no backend write, matching `src/auth.ts`'s `isAuthConfigured`/guest-fallback design.

### `StudentProfile`
The onboarding wizard's answers (`src/components/onboarding/`), one per student.

| Column | Type | Notes |
| --- | --- | --- |
| `profileId` | `BigInt` id | |
| `userId` | `BigInt` unique, FK → `UserInfo` (cascade) | |
| `studentType` | `String` | `"first-year"` \| `"existing"` — app-validated, no DB enum. Matches `OnboardingProfile.studentType` |
| `institutionId` | `BigInt`, FK → `Institution` (restrict) | |
| `degree` | `String` | freeform (from `DEGREE_OPTIONS`), not an FK |
| `majorProgramId`, `minorProgramId` | `String`, `String?` | **`Program.id` slugs** from the static catalogue (e.g. `"computer-science"`), not freeform names — no FK, catalogue is static. Matches `OnboardingProfile.majorProgramId`/`minorProgramId` exactly |
| `concentrationIds` | `String[]` | `Specialization.id` slugs the student is targeting alongside their major (multi-select, optional) — matches `OnboardingProfile.concentrationIds`. Empty when the major has no specialization data or the step was skipped |
| `startingTermSeason`, `startingTermYear` | `String?`, `Int?` | only set when `studentType = "first-year"`; mirrors `lib/plan.ts`'s `TermStart` shape |
| `goals` | `String?` (text) | |
| `springSummer` | `Boolean`, default `false` | whether the plan may use Spring/Summer terms (onboarding's toggle, the Plan tab's Spring/Summer control) |
| `maxCoursesPerTerm` | `Int`, default `2` | the most courses `lib/plan.ts` puts in a Fall/Winter term (1–6; the app's `coursesPerTerm`) |
| `maxSummerCourses` | `Int`, default `2` | the most courses in a Spring/Summer term (1–3; the app's `summerPerTerm`) |

### `StudentCourse`
Transcript entries — one row per (student, course code, status).

| Column | Type | Notes |
| --- | --- | --- |
| `studentCourseId` | `BigInt` id | |
| `userId` | `BigInt`, FK → `UserInfo` (cascade) | |
| `courseCode` | `String` | matches the static catalogue, e.g. `"CMPT145"` — no FK, catalogue isn't a DB table |
| `status` | `String` | `"completed"` \| `"in_progress"` \| `"registered"` — app-validated. `registered` is onboarding's "What courses have you registered for?" list (this term) |
| `source` | `String`, default `"manual"` | `"manual"` \| `"transcript_upload"` |

`@@unique([userId, courseCode, status])`: the same code can have one `completed` row **and** one `in_progress` row at once (a retake after an earlier pass — see `src/lib/transcriptParse.ts`), just never two rows of the same status. No grades or credit-units-earned are tracked — the real transcript parser (`TranscriptParseResult`) only ever extracts course codes, nothing else.

### `GeneratedPlan`
A cached snapshot of one computed plan, one per student (replaces the old `localStorage` blob).

| Column | Type | Notes |
| --- | --- | --- |
| `planId` | `BigInt` id | |
| `userId` | `BigInt` unique, FK → `UserInfo` (cascade) | one current plan per student |
| `targetProgramId` | `String` | a `Program.id` slug (e.g. `"computer-science"`) — no FK, catalogue is static |
| `targetSpecializationIds` | `String[]` | `Specialization.id` slugs |
| `coursesPerTerm` | `Int`, default `2` | |
| `startSeason`, `startYear` | `String`, `Int` | |
| `terms` | `Json` | a `PlannedTerm[]` snapshot from `lib/plan.ts`'s `buildPlan()` |

### `Institution`
A seeded dropdown of Canadian universities for the onboarding wizard's "University" step — **not** the same thing as `src/data/schools/*` (the static, real course/specialization data, which only exists for `'usask'`). The app resolves a chosen `Institution.name` back to its static `School` via `findSchool()` when one exists.

Seeded from `scripts/canadian-institutions-seed.json` (98 rows) by `scripts/seed-institutions.ts`, mirroring `calendue_demo`'s `Institution` model exactly: `institutionId`, `name` (unique), `province`, `city`, `country`, `timezone`, `isCustom` (true for a student's own typed-in school, excluded from the dropdown).

### `Major`
A seeded, generic dropdown/autocomplete source (121 field-of-study names), mirroring `calendue_demo`'s own `Major` table — **not currently referenced by `StudentProfile`**. The onboarding wizard's actual "Major" step (`MajorStep.tsx`) picks from `src/data/programs` (USask-specific `Program`s with real specialization data), stored as `StudentProfile.majorProgramId` — a `Program.id` slug, not a `Major.name`. This table exists for a future institution whose major list isn't backed by static program data yet, not for USask/CS today.

Seeded from `scripts/institution-majors.json` (121 rows) by `scripts/seed-majors.ts`: `majorId`, `name` (unique), `isCustom`.

## Deliberately not in the database

- **The course catalogue, programs, specializations, and scholarships/resources** (`src/data/courses.ts`, `prereqs.ts`, `specializations.ts`, `programs/*`, `schools/*`) stay static generated TypeScript files, per CLAUDE.md: "adding a program is a data task, not an engineering task." Matching/planning (`lib/match.ts`, `plan.ts`, `credentials.ts`) runs client-side over these files; the DB only stores per-student data.
- **Grades and credit-units-earned** — the real transcript parser never extracts them (only course codes, bucketed completed/in-progress).
- **Google/Apple calendar tokens, Stripe/subscription fields** — these appeared in an earlier draft of this doc as copy-pasted boilerplate from a sibling project (`calendue_demo`); nothing in StudyMax touches calendars or billing.
- **"Why this fits you" AI scholarship copy** (`lib/scholarshipAi.ts`) — ephemeral client state today, not cached anywhere.

## Migrations & seeding

```
npm run db:migrate          # prisma migrate deploy (uses DIRECT_URL, not the pooler)
npm run db:seed             # seeds Institution + Major from the two JSON files in scripts/
npm run db:studio           # visual browser for the remote DB
```

`prisma/schema.prisma`'s `datasource` block sets both `url` (pooled, pgbouncer, runtime) and `directUrl` (direct connection, used by the migration engine) — required for Supabase. Prisma's CLI doesn't read `.env.local`, so migration/studio commands are wrapped in `dotenv-cli` (see the `db:*` scripts in `package.json`).
