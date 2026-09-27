# BayMax (Max) — handoff, 2026-09-27

Read this first in a fresh session, before `docs/BayMax/implementation/*` or `spec/*` — those are the
original build plan; this file is what actually happened, what's live, and what's still open.

## Status: deployed and verified live on production

`main` @ `bbce865` (also on `Tobi`, same commit). Deployed to `study-max-theta.vercel.app` /
`www.studymax.study`. `curl https://study-max-theta.vercel.app/api/features` shows `"max":true`.

Verified directly against production (not just locally): `get_student_overview` and `run_scenario`
(drop CMPT370) both return correct results, logged via `npx vercel logs study-max-theta.vercel.app`
as `[Max] run_scenario (S5/S7) -> ok "Graduation moves from Winter 2027 to Winter 2028." [366ms]`.
Not yet verified: an actual live phone call end-to-end (Vapi ringing a real phone, full voice
conversation) — everything up to that point is confirmed working; the phone-call step itself needs
someone to actually pick up the phone and talk to Max on the deployed site.

## What's built (the must-ship path from the spec, plus follow-ups the user asked for)

- **Schema**: 10 new Prisma models (`MaxSettings`, `StudentPreference`, `StudentNote`, `PlanVersion`,
  `Scenario`, `MaxCall`, `MaxToolCall`, `ConversationSummary`, `AuditLog`, relation fields on
  `UserInfo`/`GeneratedPlan`), migrated onto the shared Supabase instance. Both raw-SQL partial
  unique indexes (`max_settings_verified_phone_uq`, `max_call_one_active_uq`) verified enforced.
- **Planning adapter** (`src/lib/max/planningAdapter.ts`) — wraps the existing deterministic planner
  (`src/lib/plan.ts`'s `buildStudentPlan`) instead of building spec `04`'s full requirement-DSL.
- **Scenario/commit pipeline** (`api/max/_scenarios.ts`) — full `draft → computed → presented →
  committed/discarded` lifecycle, confirmation-hash check, voice affirmative classifier, stale-version
  detection, idempotent commits. `api/_planVersion.ts` is the one shared write path to
  `GeneratedPlan`/`PlanVersion` (spec `03`'s "single write path"), used by both scenario commits and
  onboarding saves.
- **Tool gateway** (`api/max/tool.ts`) — the 5 tools actually shipped: `get_student_overview`,
  `run_scenario`, `discard_scenario`, `commit_scenario`, `update_name`. Vapi call-id → `MaxCall.userId`
  identity resolution (I6), webhook secret check, `MaxToolCall` dedupe, concise per-call logging
  (`[Max] toolName (skill) -> ok/error "detail" [Nms]`).
- **Vapi wiring** (`api/max/call.ts`, `api/max/webhook.ts`, `scripts/configure-max-assistant.ts`) —
  outbound call flow, call-lifecycle webhook, and the live assistant config (system prompt, all 5
  tool schemas + Vapi's built-in `endCall` tool with a mid-question rejection guard). Re-run
  `configure-max-assistant.ts` any time the prompt/tools change — it's a full overwrite, safe to re-run.
- **"Ping Max" UI** (`src/screens/PingMaxScreen.tsx`) — phone verification (real Firebase Phone Auth,
  `linkWithPhoneNumber`/`signInWithPhoneNumber` in `src/auth.ts`) → consent → call, gated behind the
  `max` feature flag (`api/features.ts`/`src/features.ts`).
- **Real signed-in identity** (`api/_maxIdentity.ts`) — Max resolves to whichever real account is
  signed in (via `Authorization: Bearer <idToken>`, same as `api/session.ts`), falling back to the
  seeded demo student only for a guest. `api/session.ts` now also computes and keeps a real
  `GeneratedPlan`/`PlanVersion` current for signed-in students on every autosave (previously nothing
  wrote `GeneratedPlan` for a real user — only the demo seed script did).
- **Settings additions**: "Your program" section (edit major/minor/specializations/graduation year
  post-onboarding — `src/screens/EditProfileSheets.tsx`) and a "Max" section (name override + consent
  revoke — `src/screens/EditMaxNameSheet.tsx`, `AccountSheet.tsx`).
- **Demo student**: `scripts/seed-demo-student.ts`, idempotent, targets `software-development`,
  drop-CMPT370 scenario. **Numbers changed mid-session** (see below) — currently
  `Winter 2027: CMPT371, CMPT470` baseline; dropping CMPT370 → `Winter 2027: CMPT370`,
  `Winter 2028: CMPT371, CMPT470` (a full year out, not one term).

## Two real bugs found and fixed during deploy (know these before touching this code)

1. **`.ts`-suffixed imports crash in production.** Vercel's Node builder transpiles each `.ts` file
   1:1 without rewriting import specifiers, so a `.ts`-suffixed relative import 404s at runtime
   there (works fine in Vite and locally). `api/session.ts`/`api/max/_scenarios.ts` are the first
   code to actually execute (not just type-import) `src/lib/plan.ts` and the whole
   `src/data/programs/*` graph server-side, so ~30 files' internal imports got rewritten to `.js`.
   **This broke plain `node scripts/check-*.ts`** (Node doesn't resolve `.js` specifiers to sibling
   `.ts` files the way Vite does) — fixed with `scripts/_resolve-ts-loader.mjs`; every affected
   script's header comment now shows the updated invocation. Full explanation in `CLAUDE.md` under
   "The `.js`-extension convention, and where it now reaches". **If you add a new program file or
   touch this graph, keep using `.js` extensions in its imports.**
2. **A teammate's pending migration** (`20260927000000_add_term_load_preferences` — Spring/Summer +
   course-load prefs on `StudentProfile`) was merged into `main` but never applied to the shared DB.
   Deploying would have made it a live crash for anything touching `StudentProfile`. Applied it
   (simple, additive, 3 columns with defaults matching prior behavior) — tell whoever wrote it it's
   now live.

## Three more bugs found and fixed, 2026-09-27 (course/term data correctness)

Found by tracing exactly how "what courses am I taking now?" and "what am I taking in Winter 2027?"
get answered, then checking the real values against the live demo student (`userId 8`) instead of
trusting the code's own claims:

1. **`{{currentTerm}}`/`{{currentCoursesLine}}` were the graduation term, not the current one.**
   `api/max/call.ts` computed both from `plan.terms[plan.terms.length - 1]` — but `GeneratedPlan.terms`
   only ever holds courses not yet taken (`buildStudentPlan` assumes in-progress ones are already done
   "by start", `src/lib/plan.ts`), so its last entry *is* the graduation term. Live proof before the
   fix: the demo student's `plan.terms` had one entry, `Winter 2027: CMPT371, CMPT470` (their actual
   graduation term) — while their real in-progress courses (`StudentCourse.status = "in_progress"`)
   were `CMPT332, CMPT340, CMPT353, CMPT360, CMPT370, CMPT434, MATH266`. A judge opening with "what am
   I taking now" would have gotten the wrong 2 courses instead of the right 7. Fixed by adding
   `currentTermOf()` to `src/lib/plan.ts` (moved from `src/lib/skillTree.ts`, which now re-exports it —
   same "term before the next registration term" math the Academic Skill Tree already relied on) and
   reading `currentCoursesLine` from `StudentCourse` directly. `api/max/tool.ts`'s `get_student_overview`
   already read current courses from `StudentCourse` correctly — only its return shape was missing a
   `currentTerm` field, now added for parity.

   **Exact change in `src/lib/skillTree.ts`** (no behavior change there, purely a relocation):
   `currentTermOf()` was defined locally at the bottom of that file, built on `upcomingTerm()` imported
   from `plan.ts`. It's now a one-line re-export — `export { currentTermOf }` — of the identical
   function that now actually lives in `plan.ts` (so `api/max/call.ts` and `api/max/tool.ts`, both
   server-side and outside `skillTree.ts`'s own dependency graph, can use it too). The `upcomingTerm`
   import dropped out of `skillTree.ts`'s import line since nothing else in the file used it directly.
   Every existing import of `currentTermOf` from `'../lib/skillTree.ts'` (`src/skilltree/planView.ts`,
   `scripts/check-skill-tree.ts`) keeps working unchanged through the re-export — confirmed by rerunning
   `scripts/check-skill-tree.ts`, which still passes (`Skill tree OK. sample: 36 courses, 4 leaves, 35
   prerequisite links, 2200px tall.`).
2. **Program/specialization names were spoken as raw catalogue slugs.** `profile.majorProgramId`,
   `minorProgramId`, and `plan.targetSpecializationIds` are `Program.id`/`Specialization.id` slugs like
   `"computer-science"`, not display names — `api/max/call.ts`'s `{{programLine}}` and
   `api/max/tool.ts`'s `get_student_overview` `program` object sent them straight through, so Max would
   have said "computer-science" instead of "Computer Science" out loud. Fixed with
   `programName()`/`specializationName()` in `src/lib/max/planningAdapter.ts` (looks up `Program.name`/
   `Specialization.name` in the static `programs` graph, falls back to the raw id if somehow unknown).
3. **`{{wellnessResourceLine}}` was never set.** Referenced in the live system prompt's distress-boundary
   line since the prompt was first written, but no `variableValues` entry ever supplied it — spec `11`'s
   "institution-configured, with a national fallback" wellness text was deferred and nobody added even
   the fallback half. If a real student had shown distress on a call, Max's own instructions would have
   contained a literal, unresolved `{{wellnessResourceLine}}` with nothing real to share. Fixed with a
   hardcoded national fallback in `api/max/call.ts` (Canada/US's 988 Suicide Crisis Helpline) — a real,
   current, verifiable public service, not a fabricated number. A per-`Institution` field is the correct
   long-term fix (→ spec `11`) but out of scope this weekend.

All three verified against the live shared DB (demo student, `userId 8`) after the fix — see
`docs/BayMax/implementation/assistant-config-reference.md`'s three new notes for the exact before/after
values. `npm run build`, `npm run lint`, and `check-plan.ts`/`check-planning-adapter.ts`/
`check-skill-tree.ts` all pass with the change (the last one exercises the moved `currentTermOf`).

## Known gaps / not yet done

- **⚠️ Phone-ownership OTP verification is currently disabled** — `OTP_GATE_ENABLED = false` at the
  top of `src/screens/PingMaxScreen.tsx`, added 2026-09-27 because Firebase Phone Auth was failing on
  this project (Phone provider / Blaze plan still being sorted — authorized domains were already
  correct). "Send code" currently just saves whatever number was typed as verified and moves straight
  to consent, with no proof the person setting it up actually owns that number. **This is the exact
  thing spec `11` calls out**: "Phone ownership verified by SMS OTP before the first call. Prevents
  using Max to harass a third party." Flip `OTP_GATE_ENABLED` back to `true` once Firebase Phone Auth
  actually works — do this before anyone outside the team can reach "Ping Max" unsupervised, not just
  before the demo.
- **No real phone call has actually been placed and completed end-to-end yet** (see Status above) —
  do this next, on the live site, not localhost.
- **Vapi phone number is a US number** (`+1 314 661 9879`, imported from Twilio), not Canadian —
  Vapi's free numbers can't call international/cross-border at all (tried and confirmed), so a real
  Twilio number was the fix. Canada calling requires enabling Canada under Twilio Console → Voice →
  Settings → Geo Permissions (this was done for testing; confirm it's still on before the real demo).
- **`ConversationSummary`, cross-call memory, `search_courses`/`get_course_details`/`save_preference`/
  `evaluate_decision`, S3/S4/S6/S8/S9 skills** — all still deferred per spec `07`'s backlog, unchanged.
- **The "Name Max uses" override** (`EditMaxNameSheet`) gets silently reset for a signed-in user the
  next time `api/session.ts` autosaves (it unconditionally sets `firstName` from the Firebase account
  name) — known, accepted limitation, not fixed.
- **Legal/compliance sign-off** (spec `11`) — still explicitly not obtainable this weekend, unchanged.

## Where things live (if you need to change config again)

- `.env.local` (gitignored) has all four `VAPI_*` vars, real values. Also pushed to Vercel's
  Production/Preview/Development env vars (dashboard: Settings → Environment Variables).
- Vapi assistant "Max" (`79c75291-0d02-411f-9d04-16e9714acb78`) — system prompt/tools live-pushed via
  `scripts/configure-max-assistant.ts`. Reference copy kept in sync at
  `docs/BayMax/implementation/assistant-config-reference.md`.
- Demo student: `authUid: "baymax-demo-student"`, reset anytime with `npm run db:seed:demo-student`.

## Suggested next steps

1. Place a real test call on `www.studymax.study` (signed in, for the real-identity path; guest +
   "Load a sample student" for the safety-net path) and actually talk to Max.
2. Watch `npx vercel logs study-max-theta.vercel.app` live during that call.
3. Re-seed the demo student (`npm run db:seed:demo-student`) after any test call before the real demo.
4. Tell the team: the migration landed, the `.js`-extension convention now applies to
   `src/lib/plan.ts`/`src/data/programs/*`, and Ping Max is live on the real site for anyone who opens
   it (feature-flagged on real Vapi keys, not a toy).
