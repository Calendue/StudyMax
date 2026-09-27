# 03 — Data Model (additions only)

The existing Prisma schema (`UserInfo`, `StudentProfile`, `StudentCourse`, `GeneratedPlan`, `Institution`, `Major`) and the onboarding flow are **not** re-specified here. This file defines only what Max, scenarios, versioning, and memory need on top of them, and follows the existing conventions:

- `BigInt @id @default(autoincrement())` keys, `userId` FK to `UserInfo` with `onDelete: Cascade`.
- Enum-like strings as `@db.VarChar`, validated app-side (no DB enums).
- Catalogue references are static slugs/codes with no FK (`Program.id`, `Specialization.id`, `"CMPT145"`).
- Terms use the existing `{ season, year }` shape from `lib/plan.ts`.

## How other spec files map to this schema

Files 04–12 use conceptual names. They resolve to:

| Name in specs | Actual model |
|---|---|
| Student | `UserInfo` + `StudentProfile` + `MaxSettings` (new) |
| ProgramEnrollment | `StudentProfile.majorProgramId / minorProgramId / concentrationIds` (history via `PlanVersion` snapshot + `AuditLog`) |
| CourseAttempt | `StudentCourse` |
| Roadmap (official) | `GeneratedPlan` (the head) |
| RoadmapVersion | `PlanVersion` (new) |
| Scenario | `Scenario` (new) |
| Preference | `StudentPreference` (new) |
| StudentNote | `StudentNote` (new); onboarding goals stay in `StudentProfile.goals` |
| Call | `MaxCall` (new) |
| ConversationSummary | `ConversationSummary` (new) |
| AuditLog | `AuditLog` (new) |
| Course, Program, RequirementNode, CourseOffering | static catalogue, not Prisma (→ 04) |

## Prisma additions

### Relation fields to add to existing models

Prisma requires both sides of a relation. These are the only edits to existing models.

```prisma
model UserInfo {
  // ...existing fields unchanged
  maxSettings  MaxSettings?
  preferences  StudentPreference[]
  notes        StudentNote[]
  scenarios    Scenario[]
  calls        MaxCall[]
  summaries    ConversationSummary[]
  auditLogs    AuditLog[]
}

model GeneratedPlan {
  // ...existing fields unchanged
  version  Int           @default(1) // = versionNumber of the PlanVersion this head mirrors; optimistic-concurrency check for scenario commits
  versions PlanVersion[]
}
```

### MaxSettings — calling setup (1:1 with UserInfo)

Kept out of `StudentProfile` so Max concerns don't leak into the profile, and so students who skip Max have no row.

```prisma
model MaxSettings {
  userId             BigInt    @id
  phoneE164          String?   @db.VarChar // "+13065551234"
  phoneVerifiedAt    DateTime? @db.Timestamp(6) // null → Ping Max disabled
  callConsentGranted Boolean   @default(false)
  callConsentVersion String?   @db.VarChar // version id of the consent text shown
  callConsentAt      DateTime? @db.Timestamp(6)
  timezone           String?   @db.VarChar // IANA; null → falls back to Institution.timezone (quiet hours, → 09)
  hasMetMax          Boolean   @default(false) // flips true after first completed call; drives first-call intro
  createdAt          DateTime  @default(now()) @db.Timestamp(6)
  updatedAt          DateTime  @updatedAt @db.Timestamp(6)

  user UserInfo @relation(fields: [userId], references: [userId], onDelete: Cascade)
}
```

Raw SQL in the migration (Prisma can't express partial uniques): one verified number per account.

```sql
CREATE UNIQUE INDEX max_settings_verified_phone_uq
  ON "MaxSettings" ("phoneE164") WHERE "phoneVerifiedAt" IS NOT NULL;
```

Phone OTP: if you use Firebase phone verification (you're already on Firebase Auth) or a provider like Twilio Verify, no OTP table is needed; write `phoneVerifiedAt` on success.

### StudentPreference — typed preferences

```prisma
model StudentPreference {
  preferenceId BigInt   @id @default(autoincrement())
  userId       BigInt
  key          String   @db.VarChar // registry key, validated against lib/preferences.ts
  value        Json     // shape defined per key by the registry
  source       String   @db.VarChar // "onboarding" | "max" | "settings"
  evidence     String?  @db.Text    // utterance or UI action that set it
  createdAt    DateTime @default(now()) @db.Timestamp(6)
  updatedAt    DateTime @updatedAt @db.Timestamp(6)

  user UserInfo @relation(fields: [userId], references: [userId], onDelete: Cascade)

  @@unique([userId, key]) // one value per key; also serves as the userId index
}
```

**`maxCoursesPerTerm` vs `GeneratedPlan.coursesPerTerm`.** These are deliberately different fields:

- `StudentPreference(maxCoursesPerTerm)` = what the student wants.
- `GeneratedPlan.coursesPerTerm` = what the current plan was built with.

Writing a preference never touches the plan (→ 10). When they differ, `save_preference` returns `affectsRoadmap: true`. If no preference row exists, read `GeneratedPlan.coursesPerTerm` as the default. No backfill needed.

### StudentNote — free-text context for Max

```prisma
model StudentNote {
  noteId    BigInt   @id @default(autoincrement())
  userId    BigInt
  text      String   @db.Text
  source    String   @db.VarChar // "max" | "settings"
  createdAt DateTime @default(now()) @db.Timestamp(6)

  user UserInfo @relation(fields: [userId], references: [userId], onDelete: Cascade)

  @@index([userId])
}
```

Never consumed by the planner.

### PlanVersion — immutable plan history (I4)

`GeneratedPlan` stays the head that existing code reads. Every write to it also appends a `PlanVersion` **in the same transaction**. The head is effectively a cache of the latest version.

```prisma
model PlanVersion {
  planVersionId BigInt @id @default(autoincrement())
  planId        BigInt
  versionNumber Int
  parentVersion Int?   // versionNumber this was derived from; null for v1

  // Snapshot of planner inputs, so a restore rebuilds the head exactly
  targetProgramId         String   @db.VarChar
  minorProgramId          String?  @db.VarChar
  targetSpecializationIds String[]
  coursesPerTerm          Int
  startSeason             String   @db.VarChar
  startYear               Int

  terms              Json    // PlannedTerm[] — same shape as GeneratedPlan.terms
  projectedGradSeason String? @db.VarChar
  projectedGradYear   Int?
  validation         Json    // ValidationResult (→ 05)
  plannerVersion     String  @db.VarChar // code version of buildPlan/planner
  inputsHash         String  @db.VarChar // hash of planner inputs; determinism check (→ 05)

  createdBy  String   @db.VarChar // "backfill" | "onboarding" | "scenario_commit" | "restore"
  scenarioId BigInt?  @unique     // one scenario commits at most once → commit idempotency (→ 06)
  createdAt  DateTime @default(now()) @db.Timestamp(6)

  plan     GeneratedPlan @relation(fields: [planId], references: [planId], onDelete: Cascade)
  scenario Scenario?     @relation(fields: [scenarioId], references: [scenarioId], onDelete: SetNull)

  @@unique([planId, versionNumber])
}
```

Required changes outside Prisma:

- **Backfill**: for each existing `GeneratedPlan`, insert `PlanVersion` v1 with `createdBy: "backfill"` and `version = 1` on the head.
- **Single write path**: every existing place that upserts `GeneratedPlan` (onboarding's save, any "regenerate" button) must go through one helper, e.g. `commitPlanVersion(tx, planId, snapshot, meta)`, which bumps `version`, writes the head, and appends the version. A direct `prisma.generatedPlan.update` anywhere else breaks history. Lint or code-review rule.

### Scenario

```prisma
model Scenario {
  scenarioId        BigInt    @id @default(autoincrement())
  userId            BigInt
  baseVersion       Int       // GeneratedPlan.version when created; mismatch at commit → "stale"
  operations        Json      // ScenarioOp[] (below)
  resultInputs      Json?     // planner-input snapshot after ops (program, specializations, coursesPerTerm, start)
  resultTerms       Json?     // PlannedTerm[]
  diff              Json?     // RoadmapDiff (→ 05)
  validation        Json?     // ValidationResult (→ 05)
  status            String    @db.VarChar // "draft" | "computed" | "presented" | "committed" | "discarded" | "expired" | "stale"
  presentedHash     String?   @db.VarChar
  presentedAt       DateTime? @db.Timestamp(6)
  presentedVia      String?   @db.VarChar // "voice" | "app"
  origin            String    @db.VarChar // "voice" | "app" | "settings"
  callId            BigInt?
  expiresAt         DateTime  @db.Timestamp(6)
  createdAt         DateTime  @default(now()) @db.Timestamp(6)
  updatedAt         DateTime  @updatedAt @db.Timestamp(6)

  user          UserInfo     @relation(fields: [userId], references: [userId], onDelete: Cascade)
  call          MaxCall?     @relation(fields: [callId], references: [callId], onDelete: SetNull)
  committedAs   PlanVersion?

  @@index([userId, status])
}
```

IDs are sequential and appear in tool arguments. That's acceptable only because the gateway checks `scenario.userId === session.userId` on every access (I6). Don't skip that check because "the model got the id from our own tool."

### MaxCall

```prisma
model MaxCall {
  callId       BigInt    @id @default(autoincrement())
  userId       BigInt
  vapiCallId   String?   @unique @db.VarChar // set after Vapi create-call returns; the tool gateway's identity lookup (I6)
  status       String    @db.VarChar // "queued" | "ringing" | "in_progress" | "ended" | "failed" | "voicemail" | "no_answer"
  endedReason  String?   @db.VarChar
  startedAt    DateTime? @db.Timestamp(6)
  endedAt      DateTime? @db.Timestamp(6)
  durationSec  Int?
  recordingUrl String?   @db.VarChar // retention → 11
  transcript   Json?     // purge per retention policy
  createdAt    DateTime  @default(now()) @db.Timestamp(6)
  updatedAt    DateTime  @updatedAt @db.Timestamp(6)

  user      UserInfo             @relation(fields: [userId], references: [userId], onDelete: Cascade)
  scenarios Scenario[]
  toolCalls MaxToolCall[]
  summary   ConversationSummary?

  @@index([userId, createdAt])
}
```

One active call per student (raw SQL):

```sql
CREATE UNIQUE INDEX max_call_one_active_uq
  ON "MaxCall" ("userId") WHERE "status" IN ('queued', 'ringing', 'in_progress');
```

A stuck row blocks the student forever, so a sweeper job must mark calls with no status update for > 30 min as `failed`.

### MaxToolCall — dedupe + trace

Vapi can redeliver webhooks. Keying on Vapi's tool-call id makes every tool idempotent for free, and doubles as the per-tool trace in `12`.

```prisma
model MaxToolCall {
  toolCallId String   @id @db.VarChar // Vapi's tool call id
  callId     BigInt
  toolName   String   @db.VarChar
  args       Json
  result     Json?    // cached response; a redelivery returns this without re-executing
  ok         Boolean?
  errorCode  String?  @db.VarChar
  latencyMs  Int?
  createdAt  DateTime @default(now()) @db.Timestamp(6)

  call MaxCall @relation(fields: [callId], references: [callId], onDelete: Cascade)

  @@index([callId])
}
```

### ConversationSummary

```prisma
model ConversationSummary {
  summaryId   BigInt   @id @default(autoincrement())
  userId      BigInt
  callId      BigInt   @unique
  summary     String   @db.Text // exactly 3 sentences (→ 10)
  openThreads Json     // OpenThread[]
  flagged     Boolean  @default(false) // failed validation → not injected next call
  createdAt   DateTime @default(now()) @db.Timestamp(6)

  user UserInfo @relation(fields: [userId], references: [userId], onDelete: Cascade)
  call MaxCall  @relation(fields: [callId], references: [callId], onDelete: Cascade)

  @@index([userId, createdAt])
}
```

### AuditLog

Append-only. Also the only history for program changes, since `StudentProfile` is updated in place.

```prisma
model AuditLog {
  auditId    BigInt   @id @default(autoincrement())
  userId     BigInt
  actor      String   @db.VarChar // "student_app" | "max" | "system"
  action     String   @db.VarChar // "plan.commit" | "plan.restore" | "program.change" | "preference.set" | "preference.delete" | "consent.grant" | "consent.revoke" | "phone.verify"
  before     Json?
  after      Json?
  callId     BigInt?
  scenarioId BigInt?
  createdAt  DateTime @default(now()) @db.Timestamp(6)

  user UserInfo @relation(fields: [userId], references: [userId], onDelete: Cascade)

  @@index([userId, createdAt])
}
```

`callId`/`scenarioId` are plain columns, not relations, so audit rows survive a scenario or call being purged by retention.

## JSON shapes

Put these in one module (e.g. `src/lib/max/types.ts`) and validate with zod at every read/write of the `Json` columns above. Reuse `PlannedTerm` and `TermStart` from `lib/plan.ts`; don't redefine them.

```ts
type Term = { season: "Fall" | "Winter"; year: number }; // = lib/plan.ts TermStart

type ScenarioOp =
  | { op: "DROP_COURSE";     courseCode: string; term?: Term }   // "CMPT145" — static catalogue format
  | { op: "ADD_COURSE";      courseCode: string; term?: Term }
  | { op: "MOVE_COURSE";     courseCode: string; toTerm: Term }
  | { op: "PIN_COURSE";      courseCode: string; term: Term }
  | { op: "UNPIN_COURSE";    courseCode: string }
  | { op: "SET_PREFERENCE";  key: PreferenceKey; value: unknown } // commit writes StudentPreference; maxCoursesPerTerm also sets the new version's coursesPerTerm
  | { op: "SET_GRAD_TARGET"; term: Term }
  | { op: "SET_MAJOR";       programId: string }                  // Program.id slug
  | { op: "SET_MINOR";       programId: string | null }
  | { op: "SET_SPECIALIZATIONS"; specializationIds: string[] }
  | { op: "RESTORE_VERSION"; versionNumber: number };             // must be the only op

type OpenThread = { kind: "scenario" | "question"; scenarioId?: string; text: string };
```

`06` points here for the op list. Compared with the earlier draft: single major/minor (matching `StudentProfile`), specializations as a set, slug IDs, and no catalog-year op (see decision 3 below).

**Program ops on commit** update `StudentProfile.majorProgramId/minorProgramId/concentrationIds` **and** the plan head's `targetProgramId/targetSpecializationIds` in the same transaction, plus a `program.change` audit row. After any commit, the profile and the head must agree.

### Preference registry (`lib/preferences.ts`)

| key | value shape | kind | planner-enforceable |
|---|---|---|---|
| maxCoursesPerTerm | int 1–7 | hard | yes (fallback: `GeneratedPlan.coursesPerTerm`) |
| minCoursesPerTerm | int 0–7 | hard | yes |
| graduationTarget | `Term` | soft | yes |
| graduationPriority | `"asap" \| "on_time" \| "flexible"` | soft | yes |
| loadPreference | `"light" \| "balanced" \| "heavy"` | soft | yes |
| interestTopics | string[] | soft | yes (elective tiebreak) |
| avoidCourses | string[] (course codes) | soft | yes |
| avoidMorningClasses | boolean | context | no — needs section times |
| avoidDays | string[] | context | no |

`summerWillingness` is cut along with summer terms (see decision 1 below) — not part of the v1 registry.

## Decisions your existing schema forces on the other specs — RESOLVED (2026-09-26)

These aren't schema changes I'm making — they're places where the current schema can't support what 04–12 assume.

1. **No summer terms — cut from v1.** `Term` stays Fall/Winter only in both the schema and `lib/plan.ts`. Every summer example in the original doc and in 05/08 is dropped; extending the term model is real planner surgery with no time for it this weekend. `summerWillingness` is removed from the preference registry below.
2. **`StudentCourse` has no term, grade, or failed/withdrawn status — gap accepted for now.** Checked against real data: `src/data/prereqs.ts` (scraped from `catalogue.usask.ca`) has 9 genuine min-grade prerequisites (e.g. "60% or higher" in CMPT courses), so this isn't hypothetical for the pilot program. Fixing it means a `StudentCourse` migration *and* an update to the transcript-extraction prompt (which doesn't capture a grade today either) — real scope for the time left. Decision: ship without it. The audit engine treats any passing grade as satisfying grade-gated prereqs, which matches today's existing planner behavior — a known, stated limitation, not a regression.
3. **No catalog year — skip for the pilot, state it explicitly.** Fine for a single-cohort pilot where every student is on the same catalog edition anyway. Defer full catalog-year versioning until there's a second edition actually in play to test I5 against.
4. **Two sources for the student's program — `StudentProfile` is authoritative.** `GeneratedPlan.targetProgramId`/`targetSpecializationIds` are "what this plan was built for," kept in sync with the profile on every commit (→ 06).
5. **`coursesPerTerm` is a ceiling, not an exact count — and no code change is needed for this.** Checked directly against `src/lib/plan.ts`'s `buildPlan`: it already caps each term at `perTerm` (`if (thisTerm.length === perTerm) break`) and never pads a short final term up to that number — the original spec's premise here ("if `buildPlan` fills every term with exactly N courses...") was a hypothetical that turns out to be false. This decision just confirms the *semantics* Max's language and the registry naming (`minCoursesPerTerm`/`maxCoursesPerTerm`) should assume, matching what the planner already does. Existing `GeneratedPlan` rows still carry 2 unless migrated; the `maxCoursesPerTerm` fallback reads whatever the row holds, so those students keep 2 until they change it.
6. **Where do onboarding's phone number and expected graduation go?** *Decided — onboarding write path is being updated.* Phone → `MaxSettings.phoneE164`, verified via **real Firebase Phone Auth OTP** (not stubbed — this is the gate for the call feature working at all, and Firebase is already wired up for sign-in), with `phoneVerifiedAt` left null until OTP succeeds and consent written to `callConsent*` at the same step. Expected graduation → `StudentPreference(graduationTarget, source: "onboarding")`, stored as `{ season, year }`. Onboarding must write both even if the student skips Max setup, so graduation isn't lost when there's no `MaxSettings` row.
7. **Requirements live in the static catalogue.** `RequirementNode` and `PrereqExpr` from `04` are TypeScript types for the catalogue files, not Prisma models. The auditor reads the catalogue, not the DB.
