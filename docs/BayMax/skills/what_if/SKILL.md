---
name: what_if
description: "what if...", "what happens if...", "could I..." — exploring a hypothetical change to the roadmap without saving anything yet.
---

Translate the request into ops `run_scenario` actually supports:
- `DROP_COURSE` — a course they're currently taking (`courseCode`, e.g. CMPT370).
- `ADD_COURSE` — a course they want to take (`courseCode`); add `term` ("Winter 2028") only if they
  named one, otherwise the planner puts it in the first term it fits, prerequisites first.
- **Electives ("pick my electives", "what could I take for my free elective"):** call
  `get_student_overview` and use `electiveOptions` — every open elective slot with its term and the
  real catalogue courses that fill it ("CMPT 318 — Data Analytics"). Suggest only from those lists,
  with their titles, and add them with `ADD_COURSE` using that exact code and NO `term` (the planner
  puts each into its slot's term), one op per slot, all in one `run_scenario`. Never make up a course
  code from memory. If `ADD_COURSE` says a code isn't in the catalogue, it offers the nearest real
  courses — read those out, don't give up.
- `MOVE_COURSE` — move a course (`courseCode`), including one they're taking right now. Add `toTerm`
  only if they named a term; leave it out for "later" / "push it back" and the server finds the next
  term that actually works (offered then, prerequisites done, room in the load). A course they're
  taking now is dropped from this term first. Never tell them a course can't be moved.
- `UNPIN_COURSE` — take back a course they added, or let the plan place one they moved.
- `SET_PREFERENCE` — `key: maxCoursesPerTerm` (1–5 a term), `springSummer` (true/false), or
  `maxSummerCourses` (1–3 in a summer).
- `SET_GRAD_TARGET` — "I want to finish by Winter 2029" (`term`): picks the lightest pace/summers
  that gets there, or says the earliest they can.
- `SET_SPECIALIZATIONS` — switch specialization (`specializationIds`: an id or its name from
  `availableSpecializations`).
- `SET_MINOR` — add or change a minor (`programId`: a name from `availableMinors`), or `null` to drop it.
- `SET_MAJOR` — change major (`programId`: a name from `availableMajors`).
- `SET_DEGREE` — Four-year, Honours or Three-year (`variant`, from `availableDegrees`).
- `SET_INTERNSHIP` — an internship year in Year 3 or 4 (`year: 3` or `4`), or `null` for none.
- `RESTORE_VERSION` — an earlier saved plan (on its own, never with another change). `versionNumber:
  "previous"` is the plan as it was before the last save.

Several can go in one call ("add a stats minor and put CMPT 318 in Winter"). If the request doesn't map
to these, say what you can do instead that's closest to it (a move, a later term, a lighter pace) or
suggest the app. Don't call `run_scenario` with a guessed op
just to see what comes back. If they want advice rather than a specific change ("should I…", "what's
fastest"), use `recommend_plan` instead.

If it's ambiguous which course, version or specialization they mean, ask exactly one clarifying
question before calling the tool — don't guess a course code.

Call `run_scenario` with the op(s). If this is a further tweak to something already explored earlier
in this same call, pass that scenario's `scenarioId` so it builds on it rather than starting over — on
their screen, each change reshapes the tree in turn.

Speaking the result, in order:
1. The headline first — this is the graduation-date change, the whole point of the exercise.
2. If the result has `placement`, its first line: where a moved course landed and why (a term they
   named that didn't work, and the next one that does), or the soonest finish when a target couldn't
   be met.
3. Any warnings.
4. If `feasible` is false, the first error and the fix you'd suggest (a later term, a lighter pace).

When a result says `uiVisible: true`, say "it's on your screen now" the first time only; never
describe what the tree is doing — they can see it.

End with an open question, not an assumption: keep it, tweak it further, or leave it. Don't jump to
asking "want me to save that?" from here — that's a distinct, deliberate step (see `manage_roadmap`)
that only happens once the student has actually said they want to keep it.

- "Tweak it" → gather the new op(s) and call `run_scenario` again with the same `scenarioId`.
- "Leave it" → hand off to `manage_roadmap` (`discard_scenario`).
- "Keep it" / anything that sounds like a yes to saving → hand off to `manage_roadmap` for the actual
  save confirmation and `commit_scenario` — don't commit from this skill. Every kind of change,
  including a new specialization, minor or major, saves on a clear spoken yes; tapping Keep this plan
  on their screen saves it too.
