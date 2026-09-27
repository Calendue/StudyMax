# 07 — Explicitly Deferred (Read, Don't Build)

Everything here was cut from this weekend's scope during grilling (→ `docs/BayMax/spec/README.md`'s
resolved decisions). Listed so nobody re-adds it by accident mid-build, and so the post-hackathon
follow-up has a starting checklist instead of re-deriving it from the spec files again.

## Deferred entirely

- **General onboarding→DB persistence.** Firebase-auth-to-`UserInfo` bootstrap, and making onboarding
  actually write `StudentProfile`/`StudentCourse`/`GeneratedPlan` for every real user (not just the one
  seeded demo student, → `01`). This is bigger than anything BayMax-specific and blocks a real (not
  demo) launch.
- **Spec `04`'s full requirement-tree DSL and bipartite-matching audit engine.** `03` substitutes the
  existing planner. Building `04` for real is "days of careful authoring" per the spec's own estimate —
  worth doing once there's more than one pilot program's worth of runway.
- **Summer terms** (`Term` stays Fall/Winter-only). Extending this touches the schema, `lib/plan.ts`,
  and every summer-flavored preference/relaxation in specs `03`/`05`/`07`.
- **Catalog-year versioning.** Fine for a single-cohort pilot; needed once there's a second catalog
  edition in play.
- **`StudentCourse` grade/term columns and min-grade prerequisite checking.** Confirmed real for USask
  (9 min-grade rules in `src/data/prereqs.ts`) but needs a `StudentCourse` migration *and* a
  transcript-extraction prompt change — real scope, deferred.
- **Five of the nine agent tools**: `search_courses`, `get_course_details`, `save_preference`,
  `evaluate_decision`. Build only if `get_student_overview`/`run_scenario`/`discard_scenario`/
  `commit_scenario` are solid with real time left over.
- **Five of the nine skills**: S3 (degreeAudit), S4 (courseLookup), S6 (giveRecommendation), S8
  (preferenceCapture), S9 (restore/undo as its own triggered skill — `RESTORE_VERSION` still works
  mechanically via `04`, just not surfaced as its own conversational skill this weekend).
- **`ScenarioOp`s beyond `DROP_COURSE`/`RESTORE_VERSION`**: `ADD_COURSE`, `MOVE_COURSE`, `PIN_COURSE`,
  `UNPIN_COURSE`, `SET_PREFERENCE`, `SET_GRAD_TARGET`, `SET_MAJOR`, `SET_MINOR`,
  `SET_SPECIALIZATIONS`. Each needs planner support the current adapter doesn't have (→ `03`).
- **Conversation memory**: `ConversationSummary` generation, `openThreads`, multi-call continuity. Only
  matters once the demo needs more than one call.
- **Realtime UI sync during a call** (`scenario.presented`/`.committed` push to an open app session,
  `uiVisible` actually reflecting reality). Hardcoded `false` this weekend (→ `05`).
- **File 12 in full**: eval suites E1–E5, CI-blocking release gates, full tracing, weekly live-call
  human review. Only ad hoc debug logging ships now.
- **Inbound calls to Max** — spec `09` already says not for v1; unchanged.
- **Real legal counsel review** (TCPA/CRTC, PIPEDA/FERPA/GDPR, subprocessor DPAs). The practical
  mechanics (OTP, consent, quiet hours, rate limits) are built; the sign-off itself is not obtainable
  this weekend and stays open.
- **Minors handling** (date-of-birth gating, under-18 call restriction) — not mentioned in the
  must-ship path; add before any real (non-demo) student population uses this.
- **Rate limits, quiet hours, and global concurrency caps** (spec `09`) — worth a cheap version if time
  allows (a single `MaxCall` count check per day is a few lines), but not required for one demo call.

## First things to pick up after the hackathon

In rough priority order, matching spec README's original "three gaps to a winning submission" framing
but specific to BayMax:

1. General onboarding persistence (unblocks everything else being real instead of demo-only).
2. `search_courses` + `get_course_details` + S4 (courseLookup) — cheap, high demo value, reuses
   `src/lib/courseSearch.ts` if that already does keyword search over the catalogue.
3. `save_preference` + S8 — needed before `evaluate_decision`/S6 can do anything real.
4. Spec `04`'s real requirement DSL, starting with just USask CS's actual double-counting rules
   (confirm the real calendar text — `within_program` was a stand-in default, → spec `04`).
5. Eval suite E4 (simulated agent conversations) before touching the system prompt or model again —
   spec `12`'s release-gate rule is worth adopting for real once there's more than one demo path to
   protect.
