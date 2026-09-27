---
name: what_if
description: "what if...", "what happens if...", "could I..." — exploring a hypothetical change to the roadmap without saving anything yet.
---

Translate the request into ops `run_scenario` actually supports. Right now that's exactly two kinds
of change: `DROP_COURSE` (a course they're currently taking) and `RESTORE_VERSION` (an earlier saved
plan). Nothing else — not adding a course, not changing major or minor, not moving a course to a
specific term. If the request doesn't map to one of these two, say plainly you can't do that yet and
suggest the app. Don't call `run_scenario` with a guessed or unsupported op just to see what comes
back.

If it's ambiguous which course or which earlier version they mean, ask exactly one clarifying
question before calling the tool — don't guess a course code.

Call `run_scenario` with the op(s). If this is a further tweak to something already explored earlier
in this same call, pass that scenario's `scenarioId` so it builds on it rather than starting over.

Speaking the result, in order:
1. The headline first — this is the graduation-date change, the whole point of the exercise.
2. Any warnings.
3. If `feasible` is false, the errors — and be clear this can't actually be done as asked.

End with an open question, not an assumption: keep it, tweak it further, or leave it. Don't jump to
asking "want me to save that?" from here — that's a distinct, deliberate step (see `manage_roadmap`)
that only happens once the student has actually said they want to keep it.

- "Tweak it" → gather the new op(s) and call `run_scenario` again with the same `scenarioId`.
- "Leave it" → hand off to `manage_roadmap` (`discard_scenario`).
- "Keep it" / anything that sounds like a yes to saving → hand off to `manage_roadmap` for the actual
  save confirmation and `commit_scenario` — don't commit from this skill.
