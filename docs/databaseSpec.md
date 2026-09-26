# Database spec

Implemented in `prisma/schema.prisma`, migrated and seeded on the remote Supabase Postgres. This doc explains what each table is for and why — `prisma/schema.prisma` is the source of truth for exact column types/constraints; don't let this drift from it.

Auth is **Firebase** (`src/lib/auth.ts`, Google/Apple sign-in with a "continue as guest" fallback) — not Clerk. `UserInfo.authUid` holds a Firebase `AuthUser.uid`.

## Tables

### `UserInfo`
The account row, one per signed-in student.

| Column | Type | Notes |
| --- | --- | --- |
| `userId` | `BigInt` id | |
| `authUid` | `String` unique | Firebase `AuthUser.uid` |
| `firstName`, `lastName`, `email` | `String?` | from the Firebase profile |
| `createdAt`, `updatedAt` | `DateTime` | |

Relations: one `StudentProfile`, many `StudentCourse`, one `GeneratedPlan`.

Guests (no account) never get a `UserInfo` row — "continue without an account" / "skip onboarding" both work with no backend write, matching `src/lib/auth.ts`'s `isAuthConfigured`/guest-fallback design.

### `StudentProfile`
The onboarding wizard's answers (`src/components/onboarding/`), one per student.

| Column | Type | Notes |
| --- | --- | --- |
| `profileId` | `BigInt` id | |
| `userId` | `BigInt` unique, FK → `UserInfo` (cascade) | |
| `studentType` | `String` | `"starting"` \| `"existing"` — app-validated, no DB enum |
| `institutionId` | `BigInt`, FK → `Institution` (restrict) | |
| `degree`, `major` | `String` | freeform, not FKs (see `Institution`/`Major` below) |
| `minor`, `concentration` | `String?` | optional |
| `startingTermSeason`, `startingTermYear` | `String?`, `Int?` | only set when `studentType = "starting"`; mirrors `lib/plan.ts`'s `TermStart` shape |
| `goals` | `String?` (text) | |

### `StudentCourse`
Transcript entries — one row per (student, course code, status).

| Column | Type | Notes |
| --- | --- | --- |
| `studentCourseId` | `BigInt` id | |
| `userId` | `BigInt`, FK → `UserInfo` (cascade) | |
| `courseCode` | `String` | matches the static catalogue, e.g. `"CMPT145"` — no FK, catalogue isn't a DB table |
| `status` | `String` | `"completed"` \| `"in_progress"` — app-validated |
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
A seeded dropdown/autocomplete source for the "Major" step — **not** a foreign key target. `StudentProfile.major` is a plain string, same pattern `calendue_demo` uses for its own `Major` table.

Seeded from `scripts/institution-majors.json` (121 rows) by `scripts/seed-majors.ts`: `majorId`, `name` (unique), `isCustom`.

## Deliberately not in the database

- **The course catalogue, programs, specializations, and scholarships/resources** (`src/data/courses.ts`, `prereqs.ts`, `specializations.ts`, `programs/*`, `schools/*`) stay static generated TypeScript files, per CLAUDE.md: "adding a program is a data task, not an engineering task." Matching/planning (`lib/match.ts`, `plan.ts`, `credentials.ts`) runs client-side over these files; the DB only stores per-student data.
- **Grades and credit-units-earned** — the real transcript parser never extracts them (only course codes, bucketed completed/in-progress).
- **Phone numbers** (the Bland call feature, `api/call-me.ts`) — `App.tsx` has an explicit comment that the number "is deliberately excluded — it never touches storage," a privacy decision, not a gap.
- **Google/Apple calendar tokens, Stripe/subscription fields** — these appeared in an earlier draft of this doc as copy-pasted boilerplate from a sibling project (`calendue_demo`); nothing in StudyMax touches calendars or billing.
- **"Why this fits you" AI scholarship copy** (`lib/scholarshipAi.ts`) — ephemeral client state today, not cached anywhere.

## Migrations & seeding

```
npm run db:migrate          # prisma migrate deploy (uses DIRECT_URL, not the pooler)
npm run db:seed             # seeds Institution + Major from the two JSON files in scripts/
npm run db:studio           # visual browser for the remote DB
```

`prisma/schema.prisma`'s `datasource` block sets both `url` (pooled, pgbouncer, runtime) and `directUrl` (direct connection, used by the migration engine) — required for Supabase. Prisma's CLI doesn't read `.env.local`, so migration/studio commands are wrapped in `dotenv-cli` (see the `db:*` scripts in `package.json`).
