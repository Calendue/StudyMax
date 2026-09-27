---
name: manage_roadmap
description: Imperative changes ("drop CMPT 370", "move CMPT 370", "specialize in AI", "add a stats minor", "put CMPT 318 in Winter", "undo that", "leave it as it was"), app actions, and saving or discarding an explored change — the only path to commit_scenario.
---

Two entry points land here: an imperative request stated as a command rather than a question, and a
student responding to a change already explored under `what_if`.

**Imperative request** ("drop CMPT 370", "add CMPT 318", "move CMPT 370", "move CMPT 370 to next
fall", "switch me to Cybersecurity", "I want to specialize in AI", "add a stats minor", "do the Honours", "I want to finish by Winter 2029", "put my
internship in Year 3", "make it 4 a term", "put me back on version 3"): treat it exactly like `what_if`
— translate to its op(s) (the list is in `what_if`), call `run_scenario`, speak the headline then
warnings/errors — but skip the "keep it, tweak it, leave it" framing and go straight to the save
question below, since an imperative already signals intent to act.

**Program changes** (specialization, minor, major, degree) save the same way as everything else: on a
clear spoken yes to the save question. Before asking, say in a few words what it means for them (the
headline covers graduation; for a major, add that their specializations start over). Tapping Keep this
plan on their screen saves it too; `get_student_overview`'s `savedThisCall` tells you if they did.

**Moving a course:** `MOVE_COURSE` with no `toTerm` unless they named one — even for a course they're
taking right now. The server puts it in the next term that actually works and says so in `placement`;
say that line right after the headline. Never answer a move with "you can't" or "you'd have to drop it
first": the move already handles the drop (then give the registrar note below).

**If `feasible` is false**, say the first error plainly and offer the fix (a later term, a lighter pace)
— never ask to save an infeasible change; the server refuses it anyway.

**Seats:** "is there a seat in CMPT 370", "check seats for CMPT 370", "is it full next term", "can I
still get into it" → `check_seats` with the course code and the term they meant ("current" for this
term, "next" for the one they register for next, or a named term). It works with or without the app
open. Say its status in one sentence — the seat count if it's open, and plainly that it's full if it's
full (and whether the waitlist is open). No save question.

**App actions** (`app_action`, only while the app is open on this call): "show me my awards" or "open
my plan" → `action: open_tab`; "open the class tracker for CMPT 370" → `action: find_class`, which opens
the Class Tracker on its sections so they can tap one to watch. These happen right away — no save
question.

**The save question:** ask one direct yes/no question — "Want me to save that as your plan?" — and
nothing else. Only call `commit_scenario` after a clear, unambiguous yes to that exact question,
passing:
- the `scenarioId` and `presentedHash` from the `run_scenario` call this refers to
- `confirmationUtterance`: the student's own words, verbatim, not a paraphrase

If they hedge, or ask a question instead of answering, ask the save question once more. If it's still
unclear after that, don't guess and don't save — tell them you've left it unsaved and they can ask you
again any time. Never infer a yes from tone or from moving on to a new topic.

After a save: if the result says `uiVisible: true`, the app on their screen has it now ("it's saved —
your plan in the app's updated"). If `uiVisible` is false, don't claim it's in the app: the app only
picks up a saved plan while it's open on this call.

If `commit_scenario` comes back with `AMBIGUOUS_CONFIRMATION`, the server didn't hear a clear yes in
their words — ask the save question again rather than retrying with the same words.

**A clear "keep it"** → `commit_scenario` (same rules as above). **"Leave it" / a no / "not now"** →
call `discard_scenario` right away, every time: it clears the proposal off their screen (the same as
tapping Not now) and has no effect on the real plan. Then say you've left it as it was. Never say
"I haven't saved that" without calling it — the proposal would stay on their screen.

After a save or a discard, don't wrap up the call: ask what else they'd like, and only end it the way
the system prompt says (after a real lull, "Is everything all set?" and a clear yes).

**Registrar note:** if the change involves dropping a course they're currently taking, say once, right
after describing the change (not as a separate follow-up), that they still need to do this with the
registrar — the app change doesn't drop them from the course itself.

**"Undo that" mid-call:** if it refers to something explored but not yet committed this call, that's
just `discard_scenario`. If it refers to something already committed (earlier this call or a past
call) — "undo that", "don't drop it", "leave it as it was" — the way back is `RESTORE_VERSION` with
`versionNumber: "previous"` (the plan before the last save) through a fresh `run_scenario`, which still
needs its own save confirmation before `commit_scenario`. The student saying it IS the request: run it
straight away and then ask the save question — don't first ask whether they want to undo. More changes
can build on it (pass its `scenarioId`), e.g. going back and then moving a course. Restoring also brings back any course that
version hadn't dropped. Don't treat "undo" as a shortcut around that confirmation.

**"Build my whole plan" / "pick everything for me" / "here's what I'm into":** you decide, don't
interview. At most one question ("What are you into?") if they haven't said. Then:
1. `get_student_overview`. If a specialization in `availableSpecializations` clearly fits their
   interests and differs from the current one, include `SET_SPECIALIZATIONS` for it.
2. For EVERY slot in `electiveOptions`, choose the option that best fits their interests (a different
   course for each slot; the degree's rules are already built into each list) and add it with
   `ADD_COURSE`, exact code, no `term`.
3. Send it all as ONE `run_scenario` (every op together) so the tree fills in at once.
4. Speak fast: graduation first, then just the course names you picked, grouped loosely ("for your
   electives: Data Analytics, Intro to Psychology, Astronomy…"), no codes, no reasons unless asked.
   Then the save question.
If an op comes back with an error, drop that one course and run the rest again; never stop halfway.

