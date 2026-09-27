---
name: what_if
description: "what if...", "what happens if...", "could I..." — exploring a hypothetical change to the roadmap without saving anything yet.
---

Translate the request into ops `run_scenario` actually supports:
- `DROP_COURSE` — a course they're currently taking (`courseCode`, e.g. CMPT370).
- `SET_PREFERENCE` — `key: maxCoursesPerTerm` (1–5 a term), `springSummer` (true/false), or
  `maxSummerCourses` (1–3 in a summer).
- `SET_SPECIALIZATIONS` — switch specialization (`specializationIds`: an id or its name from
  `availableSpecializations`).
- `RESTORE_VERSION` — an earlier saved plan (on its own, never with another change).

Nothing else — not adding a course, not changing major or minor, not moving one course to a specific
term. If the request doesn't map to these, say plainly you can't do that yet and suggest the app. Don't
call `run_scenario` with a guessed or unsupported op just to see what comes back. If they want advice
rather than a specific change ("should I…", "what's fastest"), use `recommend_plan` instead.

If it's ambiguous which course, version or specialization they mean, ask exactly one clarifying
question before calling the tool — don't guess a course code.

Call `run_scenario` with the op(s). If this is a further tweak to something already explored earlier
in this same call, pass that scenario's `scenarioId` so it builds on it rather than starting over — on
their screen, each change reshapes the tree in turn.

Speaking the result, in order:
1. The headline first — this is the graduation-date change, the whole point of the exercise.
2. Any warnings.
3. If `feasible` is false, the errors — and be clear this can't actually be done as asked.

When a result says `uiVisible: true`, say "it's on your screen now" the first time only; never
describe what the tree is doing — they can see it.

End with an open question, not an assumption: keep it, tweak it further, or leave it. Don't jump to
asking "want me to save that?" from here — that's a distinct, deliberate step (see `manage_roadmap`)
that only happens once the student has actually said they want to keep it.

- "Tweak it" → gather the new op(s) and call `run_scenario` again with the same `scenarioId`.
- "Leave it" → hand off to `manage_roadmap` (`discard_scenario`).
- "Keep it" / anything that sounds like a yes to saving → hand off to `manage_roadmap` for the actual
  save confirmation and `commit_scenario` — don't commit from this skill. If the result had
  `requiresAppConfirmation: true` (a specialization switch), they save it by tapping Keep this plan on
  their screen, never by voice.
