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
  **`regenerate()` builds exactly the app's own plan** (2026-09-27): the whole degree where the
  program maps one, the concentrations + a declared minor as targets, the credentials the student is
  partway through, at the student's own preferences (`StudentProfile.maxCoursesPerTerm`,
  `springSummer`, `maxSummerCourses`; spec `03`'s fallback to `GeneratedPlan.coursesPerTerm`).
  Before this it planned only the specialization at a hardcoded 4 a term. Every server path uses it —
  Max's scenarios, `api/session.ts`'s autosave, the demo seed — so a scenario always diffs against a
  baseline built the same way. `validate()` now really checks the hard constraints (`OVER_LOAD`,
  `PREREQ_UNMET`, `NOT_OFFERED`, `DUPLICATE_COURSE`, using `plan.ts`'s own `courseRunsIn`/
  `prerequisitesMet`) — they hold by construction until the planner relaxes its rules
  (`RELAX_AFTER`), and an ERROR blocks the commit. Scenarios rebuild from scratch like the app; spec
  `05`'s minimal-perturbation mode is deliberately not built. One known approximation: the server
  doesn't know each in-progress course's own term (that's device-only), so it books them all in the
  term running now — the app's own default. `scripts/check-planning-adapter.ts` asserts parity with
  the app's call for 9 students, every constraint at loads 2–5 and with Spring/Summer, and that
  `validate()` catches each ERROR code.
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
  profile set to 5 courses a term with no Spring/Summer, drop-CMPT370 scenario. Reseeding also resets
  the plan to v1 and deletes versions/scenarios a test call committed. **Current numbers (whole
  degree, 2026-09-27)**: baseline `Winter 2027: CMPT371, CMPT470, Indigenous learning, Free elective,
  Free elective`; dropping CMPT370 → `Winter 2027: CMPT370, Indigenous learning, Free elective, Free
  elective` and `Winter 2028: CMPT371, CMPT470`. Headline unchanged: **"Graduation moves from Winter
  2027 to Winter 2028."** (CMPT371/470 run only in Winter, so a full year out.) The three degree slots
  are new — the old specialization-only plan never showed them. Verified end-to-end through
  `runScenario` against the live DB.

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

## Max sweep, 2026-09-27 (bugs found and fixed)

Every Max file read end to end, then the scenario flows run through the real code against the live DB
(demo student, reseeded clean afterwards). Fixed:

- **The demo's own save line didn't work.** A voice model says "cmpt 370"; the planner stores
  `CMPT370`, so a drop failed with `COURSE_NOT_IN_PROGRESS`. And "Okay, yeah, save it" didn't count as a
  yes (the classifier only matched a yes at the very start). Codes are now normalized
  (`normalizeCourseCode`), ops validated before anything runs (`cleanOps` — empty lists, missing codes,
  string version numbers, unsupported ops), and the classifier allows leading fillers and more yeses
  while staying conservative (`scripts/check-max.ts`: 15 yeses, 13 not-yeses).
- **A saved drop was forgotten by the next scenario.** A committed `DROP_COURSE` only models the drop —
  `StudentCourse` keeps the course until the registrar drop (spec `06`) — so the next what-if rebuilt
  from `StudentCourse` and silently un-dropped it, and "undo that" (restore v1) had nothing to undo. The
  scenario's `resultInputs.droppedCourses` now carries the official version's drops forward; restore
  resets them to that version's. `get_student_overview` reports them as `droppedInSavedPlan`.
- **Identity:** a signed-in student with no saved account yet silently became the demo student — Max
  would read them someone else's plan and they could overwrite the demo student's phone. Now `NO_PROFILE`
  (409), with a "finish setting up your plan first" message in Ping Max.
- **"What you're taking now" missed `registered` courses** (onboarding's this-term list) in `call.ts`
  and `get_student_overview`, though the planner counts them — now the same set everywhere.
- **Lock-outs:** a late out-of-order "ringing" webhook could reopen an ended call, and a call row that
  never heard its end held `max_call_one_active_uq` forever (`ALREADY_ON_A_CALL` on every tap). The
  webhook never reopens a finished call; `call.ts` expires "active" rows older than 30 min.
- **A call nobody answered** set `hasMetMax`, so the next one greeted them as a returning caller; now
  `no_answer`, and only an answered call counts.
- **Max said false things:** "Everything we changed is in the app" (end-of-call) and "it's saved as a
  draft in the app" — the app draws its own plan and shows neither saved plans nor drafts. Reworded in
  the prompt, `manage_roadmap`, and the unreachable `REQUIRES_APP_CONFIRMATION` line ("I've sent you a
  notification" — there are no notifications). **Needs the Vapi push** (`configure-max-assistant.ts`)
  to take effect.
- Smaller: `discard_scenario` no longer marks a committed scenario discarded; expired scenarios can't
  be continued or committed; restore can't be mixed with a drop in one scenario; malformed scenario ids
  return `UNKNOWN_SCENARIO` instead of a thrown `BigInt` error; an undone drop's headline says the course
  is "back as something you're taking now", not "no longer needed"; Ping Max no longer dead-ends on a
  blank error screen or advances to "Ready" when saving consent failed.

## Max, live on the Skill Tree (2026-09-27)

While Max is on the phone, the app's Plan tab shows his proposals reshaping the Academic Skill Tree as he
talks — courses glide to new terms, new ones sprout, dropped ones fade, the canopy rises or falls with
graduation — and a plan the student keeps becomes the app's own plan. Max can now recommend, too.

**How it fits together**
- **Same plan as the screen.** Ping Max sends the app's exact plan inputs (`CallPlanInputs`,
  `src/lib/max/live.ts`, built in `App.tsx` `maxPlanInputs`; validated by `src/lib/max/callInputs.ts`).
  They're stored on `MaxCall.planInputs`, and every scenario in the call plans from them
  (`_scenarios.ts` call scope), so Max's "before" is exactly the tree on screen. `regenerate()` now
  takes per-course seasons, the degree variant and the internship year — parity with the app is
  checked for 14 students (`check-planning-adapter.ts`), and `call.ts` reports `parity` per call.
- **Live channel.** Supabase Realtime **Broadcast** on a public channel named by the call's `liveToken`
  (192 random bits, returned only to the caller). The server publishes over REST (`api/max/_live.ts`,
  never throws, 1.5 s cap); the app listens with supabase-js, lazy-loaded (`src/maxLive/realtime.ts`).
  `api/max/live.ts` (the one new function — Vercel Hobby's 12-function cap) serves the snapshot the app
  catches up from on every (re)join, polls every 1.5 s when Realtime is missing or down, and heartbeats
  every 10 s — which is what `uiVisible` ("it's on your screen now") rides on. It also takes the app's
  Keep / Not now.
- **Max's new powers.** `SET_PREFERENCE` (courses a term 1–5, Spring/Summer, courses a summer 1–3) and
  `SET_SPECIALIZATIONS` (by id or spoken name). A switch can only be saved by the student's **Keep this
  plan** tap (I2) — voice gets `REQUIRES_APP_CONFIRMATION`. New tool `get_plan_options` (pace / summer /
  specialization, `src/lib/max/options.ts`) scores each option by building the whole plan it would give,
  so every graduation Max says is what the tree will draw; new skill `recommend_plan`. Each
  `run_scenario` call broadcasts one frame per change, played ≥1.2 s apart.
- **The app adopts a save** (`adoptMaxPlan` in `App.tsx`): targets, pace, summers, drops — so the tree
  stays in the new shape and signed-in students autosave it. Saved preferences also update
  `StudentProfile`. `api/session.ts` no longer writes a new plan version when nothing changed (it bumped
  the version under an open scenario and made Max's next save STALE).
- **UI.** `src/maxLive/MaxLiveBar.tsx` above the tree (desktop full, phone compact) + `TalkToMax` entry
  on the Plan page/tab; the tree reads `useTreeSource()` (`planView.ts`), and `useTreeTransition.ts`
  animates between frames (FLIP via the Web Animations API, sprouts, fading ghosts for pruned courses,
  bottom-anchored so the pinned roots stay put; reduced motion gets outlines and words instead).
  `src/maxLive/treeDiff.ts` is the pure diff it runs on (`check-max-live.ts`).

**Verification**: `check-max.ts` (ops, call inputs, recommendations: every option's ops apply and its
graduation is what the tree draws), `check-max-live.ts` (a dropped course moves rather than vanishes; a
switch sprouts and prunes; a 3-step proposal broadcasts ~13 KB; a whole-degree plan takes ~1.5 ms), and
**`scripts/max-e2e.ts`** — the whole live call in-process against the real DB with the real handlers
(passes; reseed afterwards). Phone-free rehearsal in the browser: `scripts/max-rehearse.ts` with a
`?rehearse=1` dry-run call (needs `MAX_DRY_RUN=1` — local/Preview only).

**Setup still needed (owner)** — until then the feature works by polling:
1. Supabase → Project Settings → API Keys: publishable key + a **secret** key. Realtime → Settings:
   **Allow public access** on (not private-channels-only).
2. Env, `.env.local` **and** Vercel (Production + Preview): `VITE_SUPABASE_URL`,
   `VITE_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY` (never `VITE_`-prefixed).
   `MAX_DRY_RUN=1` in `.env.local` / Preview only. Kill switch: `MAX_LIVE=off`.
3. Redeploy (the `VITE_*` values are baked in at build), then **push the assistant**:
   `node --experimental-strip-types --env-file=.env.local scripts/configure-max-assistant.ts` — deploy
   the API first; it overwrites the shared live assistant (new prompt, `get_plan_options`, the new
   `run_scenario` ops, `recommend_plan`). Native apps: `npm run build && npx cap sync`, rebuild.
4. Reseed the demo student before the demo: `npm run db:seed:demo-student`.

## Known gaps / not yet done

- **Outside a live call, what Max saves still doesn't reach the app.** A saved plan is adopted by the
  app only while it's open on that call (it follows the live channel). A save made with the app closed
  lives only in `GeneratedPlan`, and a signed-in student's next app autosave regenerates over it.
- **The degree variant isn't synced to the account** (`CloudSession` has no `degreeVariant`), so a
  signed-in student's server-side autosave plans the program's default degree; live calls are
  unaffected (the app sends its variant with the call).
- The internship year: live calls use the app's own `away`; outside a call, scenarios and the autosave
  read `StudentProfile.internshipAcademicYear` (Ibraheem's, merged 2026-09-27).
- **Scenario baselines for real students built before 2026-09-27** (specialization-only, 4 a term) stay
  stale until their next app autosave rewrites them with the whole-degree plan; a what-if in that window
  diffs against the old plan. The demo student is reseeded, so it's unaffected.

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

## Who Max may call (MAX_ALLOWED_NUMBERS)

While the SMS OTP gate is off and guests send their number with each call, `api/max/call.ts` only dials numbers listed in the `MAX_ALLOWED_NUMBERS` environment variable (comma-separated, any formatting, compared by digits). With none listed, Max calls nobody and the app says so (`NUMBER_NOT_ALLOWED`). Add the team's demo phones in Vercel (Production). Remove the allowlist check only once phone ownership is verified server-side again.
