# 08 — Skills as progressive-disclosure SKILL.md files, phone number cleanup

Not yet built — this is the plan for the next session to pick up and implement. Read
`docs/BayMax/HANDOFF.md` first for full current status.

## Context

Max's skills currently live as bullet points baked directly into the system prompt
(`scripts/configure-max-assistant.ts`'s `SYSTEM_PROMPT` — S1/S2/S5/S7 + the name-correction line).
The user wants this to work like Claude's own skills: each skill gets its own `SKILL.md` file, and
only a short name + trigger description sits in the always-loaded prompt — the full playbook loads
into context only when a trigger actually matches, via a tool call, not upfront.

Separately: the phone number `+16395255746` that got typed into the demo student's `MaxSettings`
during a manual test-bypass (to skip Firebase OTP while debugging) is still sitting in the shared
database right now. The *code* was never hardcoded (`api/max/call.ts` always reads
`settings.phoneE164` from the DB and 403s with `PHONE_NOT_VERIFIED` if it's missing — confirmed, no
hardcoded fallback anywhere), but that leftover DB row means the guest/"Load a sample student" path
would currently skip phone verification entirely and try to call that old number instead of
prompting whoever's actually using the app. That row needs resetting, not the code.

## Approach

### 1. Skills as SKILL.md files, loaded on demand

New directory `docs/BayMax/skills/<skill-name>/SKILL.md`, one per skill, matching Claude's own
skill format (name + one-line description as frontmatter, playbook as the body). Covers the skills
already live today — `summarize_roadmap`, `what_if`, `manage_roadmap`, `correct_name` — written out
in full now that they're not fighting for space in the system prompt.

`opening` (S1) stays as-is, **not** tool-loaded: it's already handled outside the prompt entirely
(`api/max/call.ts` sets a fixed `firstMessage` per call, first-call vs returning), so there's nothing
to progressively disclose there. Grounding/boundaries/how-you-speak also stay inline in the system
prompt — they apply to every turn, so loading them on demand would just mean loading them
immediately every time, with no benefit and one more round trip.

**New tool: `load_skill({ name })`.** `api/max/tool.ts` gets a `runLoadSkill` case: looks up the
skill by name from a generated lookup (below) and returns `{ ok: true, name, instructions }`. The
system prompt shrinks to a short routing table:
```
- summarize_roadmap: "where am I at", "remind me", "what's my plan"
- what_if: "what if...", "what happens if...", "could I..."
- manage_roadmap: imperative changes ("drop CMPT 370", "undo that")
- correct_name: student corrects their name or asks to be called something else
Call load_skill with the matching name the moment a trigger fires, before responding, then follow
what it returns.
```

**Generated lookup, not a runtime file read.** The earlier production bug this weekend (Vercel
transpiles each `.ts` 1:1 without rewriting import specifiers — see CLAUDE.md's "`.js`-extension
convention" section) makes runtime `fs.readFileSync` of markdown files a real, avoidable risk —
Vercel's file tracing for arbitrary non-code files reached via `fs` is exactly the kind of thing
that already bit us once. Instead, mirror the pattern this repo already uses for scraped data
(`scripts/scrape-prereqs.ts` → `src/data/prereqs.ts`): a new `scripts/build-skills.ts` reads every
`docs/BayMax/skills/*/SKILL.md`, parses the frontmatter + body, and writes
`src/lib/max/skills.generated.ts` (a plain `Record<string, {name, description, instructions}>` —
normal data import, zero runtime file I/O, nothing new for Vercel to trace). Re-run it whenever a
`SKILL.md` changes; add an `npm run build:skills` script for it.

Update `scripts/configure-max-assistant.ts`: shorter `SYSTEM_PROMPT`, new `load_skill` tool schema,
re-run to push. Update `docs/BayMax/implementation/assistant-config-reference.md` to match.

**Honest trade-off to flag, not hide:** spec `07`'s whole reason for collapsing ~40 tools down to
~9 coarse ones was to avoid exactly this kind of extra round trip — every skill now costs one more
model turn + webhook call before Max can actually respond, and it's one more place a model can just
skip the step and wing it from training data instead of the real playbook. That's a real latency and
reliability cost against a real, if hard to quantify, benefit (a much smaller always-loaded prompt,
and skills that can grow without fighting for prompt space). Worth watching for on the first real
test call — if `load_skill` gets skipped or adds noticeably dead air, that's the first thing to check.

### 2. Reset the demo student's leftover test phone data

`MaxSettings` for `authUid: "baymax-demo-student"` currently has a real phone number + verified
timestamp from a one-off debugging bypass. Reset it (`phoneE164: null, phoneVerifiedAt: null,
callConsentGranted: false, callConsentAt: null`) so the guest path genuinely prompts for
verification again, matching what the code already does correctly. One-off DB fix, not a code change.

## Files touched

- New: `docs/BayMax/skills/summarize_roadmap/SKILL.md`, `what_if/SKILL.md`,
  `manage_roadmap/SKILL.md`, `correct_name/SKILL.md`
- New: `scripts/build-skills.ts`, `src/lib/max/skills.generated.ts` (generated, committed like
  `src/data/prereqs.ts` is)
- Edited: `api/max/tool.ts` (new `load_skill` case), `scripts/configure-max-assistant.ts` (shorter
  prompt, new tool schema), `docs/BayMax/implementation/assistant-config-reference.md`,
  `package.json` (`build:skills` script)
- DB only, no file: reset the demo student's `MaxSettings` phone/consent fields

## Verification

1. `npm run build:skills` then `npm run build && npm run lint` — confirm the generated module
   compiles and nothing else breaks.
2. Re-run `scripts/configure-max-assistant.ts`, then read the assistant back
   (`assistants.get`) to confirm the shorter prompt and `load_skill` tool landed.
3. Hit the deployed `/api/max/tool` webhook directly (same technique used earlier this session)
   with `{"name": "load_skill", "arguments": {"name": "what_if"}}` against a fake `MaxCall` row —
   confirm it returns the real playbook text.
4. Confirm the demo student's `MaxSettings` phone fields are actually cleared
   (`npm run db:studio` or a direct query).
5. Real call test (can't be done by the agent implementing this): watch whether Max actually calls
   `load_skill` before handling a what-if/manage-roadmap/name-correction request, and whether it
   adds noticeable delay.
