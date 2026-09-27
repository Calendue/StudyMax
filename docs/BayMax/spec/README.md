# StudyMax — Spec Index

StudyMax helps new and continuing university students declare a program, get a term-by-term course roadmap, and keep that roadmap current with **Max**, a voice agent (Vapi) that calls the student and plans with them.

Onboarding (including transcript upload) and the core Prisma schema already exist and are not re-specified. This folder is split so each file can be grilled and implemented independently. Files reference each other by number (e.g. `→ 06`).

## Build target: this hackathon weekend

This is being attempted **now**, not as a post-hackathon roadmap — team is aligned, and the Bland→Vapi / gpt-5-mini→GPT-4.1 switch (→ 09) is decided. Given the time left (today + tomorrow morning per the root `CLAUDE.md`), scope is deliberately tiered:

- **Must-ship**: one real end-to-end voice call — a live Vapi call hitting `get_student_overview`, `run_scenario`, and `commit_scenario` against real USask CS data. `discard_scenario` is cheap enough to include alongside `run_scenario` (a status flip, no new pipeline). The requirement DSL, audit engine, and planner only need to be solid enough to support that one path convincingly, not the full 9-tool surface or every skill in `08`.
- **Deferred to post-hackathon**: file `12`'s eval suites (E1–E5), CI gates, tracing, and weekly live-call review — build only enough logging to debug live during the build. `search_courses`, `get_course_details`, `save_preference`, `evaluate_decision` ship only if time allows after the must-ship path works.
- **Implementation plan**: once this spec update is confirmed, the actual build plan goes in `docs/BayMax/implementation/` as separate files (one per major area), not crammed into one document.

### Relationship to the existing Bland call

Max's call **replaces** the existing one-way Bland scholarship-deadline call as the product's calling feature going forward. Max is planning-only (no scholarship skill) — the scholarship-deadline reminder is dropped from the call entirely, not ported into a Max skill. Scholarship ranking/copy stays app-only.

Because the must-ship tier is a single live Vapi demo path and Vapi integration is new, **`api/call-me.ts` (the Bland call) stays in the codebase, feature-flagged**, as a fallback for the actual demo if Max isn't proven live in time. This isn't a product direction (Max is still the intended replacement) — it's a safety net for the rule in `CLAUDE.md` that the deployed demo must never break, given the phone call is called out there as the pitch's emotional payoff.

### Persistence layer gap (discovered during implementation planning)

The Prisma schema is migrated onto the shared Supabase instance, but **no code anywhere reads or writes it** — `@prisma/client` is only used in `scripts/seed-*.ts`. The app is still 100% localStorage for `StudentProfile`/`StudentCourse`/`GeneratedPlan`; onboarding never writes to the DB. This isn't a BayMax-specific gap, but everything in `03`–`12` assumes a real server-side student record to read/write (I1, I6).

**RESOLVED**: don't build general onboarding→DB persistence this weekend. Seed **one demo student** directly into the DB via a script (`UserInfo` + `StudentProfile` + `StudentCourse` rows + a `GeneratedPlan`, matching a realistic partway-through USask CS transcript). Max's tool gateway and every BayMax table (`MaxSettings`, `Scenario`, `PlanVersion`, etc.) point at that one seeded user. Onboarding's UI and write path are untouched — this stays a known, separate gap for after the hackathon.

### Migration ownership

File `03` adds ~8 new Prisma models to the one shared remote Supabase instance all four teammates use. Per `CLAUDE.md` (`prisma migrate deploy`, no shadow DB), one person owns this: **Tobi runs the migration, announces it in the team channel first**, teammates pull after. No parallel schema changes from anyone else until that lands.

### Legal/compliance items (→ 11)

None of file `11`'s counsel-only items (TCPA/CRTC, PIPEDA/FERPA/GDPR, subprocessor DPAs) can get real legal review this weekend. The practical mechanics still get built — phone OTP (real Firebase Phone Auth, not a stub), consent checkbox + timestamp, revocable consent, quiet hours, rate limits — because they're good product practice regardless of counsel. Legal sign-off itself stays an open, non-blocking item.

## Files

| # | File | Covers | Depends on |
|---|------|--------|------------|
| 03 | `03-data-model.md` | Prisma additions on top of the existing schema, JSON shapes, preference registry, decisions the schema forces | existing schema |
| 04 | `04-degree-requirements.md` | Requirement/prerequisite DSL, catalog years, degree audit | 03 |
| 05 | `05-planning-engine.md` | Plan generation, validation, diffing, infeasibility | 03, 04 |
| 06 | `06-scenarios-and-commits.md` | Scenario lifecycle, operations, confirmation, restore | 03, 05 |
| 07 | `07-tool-surface.md` | Internal service API vs. the small tool set Max actually sees | 05, 06, 10 |
| 08 | `08-max-agent.md` | Persona, voice rules, skills, system prompt template | 07, 10 |
| 09 | `09-voice-integration.md` | Vapi call flow, assistant config, webhooks, latency, UI sync | 07, 08 |
| 10 | `10-memory.md` | Preferences, conversation summary, write/read rules | 03 |
| 11 | `11-safety-privacy-compliance.md` | Consent, auth, privacy, disclaimers, abuse | all |
| 12 | `12-observability-evals.md` | Logging, metrics, eval suites, acceptance thresholds | all |

## v1 scope

In scope (new work): plan versioning, deterministic roadmap validation/regeneration, Max outbound calls triggered by the student, what-if scenarios, confirmed commits, restore.

Out of scope for v1: course registration or any write to the university's SIS, section-level timetabling, grade prediction, financial aid/tuition modeling, inbound calls to Max, multiple institutions (the data model supports it; the content pipeline does not yet).

## System invariants

These are referenced across files as `I1`–`I7`. Anything that violates one is a bug.

- **I1 — Structured data is authoritative.** Program, courses, requirements, and roadmap come from the database. The conversation summary and LLM output are never a source of truth for them.
- **I2 — The LLM cannot write official state.** Official roadmap and program changes happen only through `commitScenario`, which the server accepts only with a valid confirmation (→ 06). Enforcement is server-side, not prompt-side.
- **I3 — Planning is deterministic.** The planner, validator, and auditor are code, not LLM calls. Same inputs produce the same roadmap. The LLM explains results; it does not compute them.
- **I4 — History is immutable.** Every committed roadmap is a new version. Restore creates a new version; nothing is overwritten.
- **I5 — Requirements are evaluated against the student's catalog year**, not the current calendar.
- **I6 — Identity comes from the session, never from tool arguments.** No agent tool accepts a `studentId` (→ 07, 11).
- **I7 — Max is not an official advisor.** Plans are guidance; the institution's rules and advisors are final.

## Glossary

- **Term** — an academic session, identified as `YYYY-SEASON` (`2027-FALL`, `2028-WINTER`, `2028-SPRING`, `2028-SUMMER`).
- **Catalog year** — the edition of the academic calendar whose requirements govern the student.
- **Roadmap** — a student's term-by-term plan. Has an official version plus history.
- **Requirement slot** — a roadmap placeholder satisfied by any course from a set (e.g. "300-level CS elective") rather than a specific course.
- **Scenario** — a hypothetical copy of the student's state with a list of operations applied. Never official until committed.
- **Proposal** — a computed, validated scenario that has been presented to the student.
- **Audit** — evaluation of a course record against a requirement tree.
- **Service function** — an internal backend function (the ~40 functions in the original design).
- **Agent tool** — one of the ~9 coarse functions exposed to the LLM in Vapi.
- **Skill** — a playbook describing how Max handles an intent: which agent tools, in what order, what to say.

## What changed from the original architecture doc

Read these before grilling; each is argued in the referenced file.

1. **The LLM no longer orchestrates the tool chain** (→ 07). `/WhatIf` was eight sequential tool calls. Over a phone line with GPT-4.1, that is several seconds of dead air per scenario and eight chances for the model to skip a step (e.g. skip `validateRoadmap`). Skills now map to one or two coarse agent tools; the pipeline (`createScenario → update → regenerate → validate → compare`) runs server-side as one call.
2. **~40 tools became ~9 agent tools.** The full list stays as the internal service API. Large tool lists degrade tool selection and bloat every turn's prompt.
3. **Commits require a server-checked confirmation token** (→ 06), bound to exactly what was shown. A "yes" to a proposal that has since been recomputed is rejected.
4. **Program changes (major/minor/concentration) cannot be committed by voice** (→ 06). They need an in-app tap. Speech-to-text errors plus a high-stakes change is a bad combination.
5. **Removed undefined commit tools**: `changeMajor`, `addMinor`, `dropCourse`, `registerForCourse`. The first three become scenario operations; registration is out of scope (it implies SIS write access nobody has specified).
6. **Conversation summary is written by the backend on call end**, not by the LLM mid-call (→ 10). Calls drop; the model shouldn't spend turns on bookkeeping.
7. **Preferences are typed**, from a registry the planner can consume (→ 03, 10). A free-form `UserPreferences[]` can't be enforced as a constraint.
8. **The planner regenerates with minimal perturbation** (→ 05). Otherwise "what if I drop CS301" reshuffles the whole plan and the diff is noise.
9. **Added what was implied but missing**: requirement DSL, phone verification + call consent, degree audit skill (referenced as `/degreeAudit` but never defined), UI sync when the student isn't looking at the app, voicemail/drop handling, and `prefersNo8AMClasses` being unenforceable without section data (→ 03).

## Consolidated open questions — RESOLVED (2026-09-26 grilling session)

See also the seven schema-forced decisions at the end of `03`, all resolved there.

1. **Pilot institution and data author**: USask Computer Science — the only program with trustworthy, already-scraped catalogue/prereq data, reused from the current hackathon build.
2. **Onboarding Accept**: commits directly, as today (`PlanVersion` v1). No prior official version exists to diff against, so routing it through the scenario/present/confirm flow adds ceremony with nothing to guard.
3. **Double-counting default** (→ 04): `within_program` when a node doesn't state a policy — a course can satisfy multiple nodes inside the same program's tree, never shared across major+minor by default. The pilot's actual calendar rule still needs confirming against real USask policy text before this is trusted as more than a safe default.
4. **Minimum full-time load**: hard constraint when set. Under-loading a student who needs full-time status for funding/visa reasons is worse than an occasionally-infeasible plan.
5. **Inbound calls**: not needed for v1, confirmed — no change from the spec's original assumption.
6. **Retention periods**: keep the spec's defaults (recordings 30 days, transcripts 90 days, summaries until account deletion) as working numbers, explicitly still pending real counsel review (→ 11).

Genuinely still open (not resolvable this weekend): the actual legal sign-off items in `11`, and the pilot institution's real double-counting policy text (default above stands in until then).
