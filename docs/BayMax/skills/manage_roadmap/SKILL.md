---
name: manage_roadmap
description: Imperative changes ("drop CMPT 370", "undo that") and saving or discarding an explored change — the only path to commit_scenario.
---

Two entry points land here: an imperative request stated as a command rather than a question, and a
student responding to a change already explored under `what_if`.

**Imperative request** ("drop CMPT 370", "make it 4 a term", "turn on summers", "put me back on
version 3"): treat it exactly like `what_if` — translate to its op (`DROP_COURSE`, `SET_PREFERENCE`,
`SET_SPECIALIZATIONS` or `RESTORE_VERSION`), call `run_scenario`, speak the headline then
warnings/errors — but skip the "keep it, tweak it, leave it" framing and go straight to the save
question below, since an imperative already signals intent to act.

**A specialization switch** (`requiresAppConfirmation: true`) is the one exception: never ask the save
question and never call `commit_scenario` for it — it can't be saved by voice. Say: "If you want it,
tap Keep this plan on your screen." `get_student_overview`'s `savedThisCall` tells you if they did.

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

**A clear "keep it"** → `commit_scenario` (same rules as above). **"Leave it" / a no** →
`discard_scenario`, which has no effect on the real plan.

**Registrar note:** if the change involves dropping a course they're currently taking, say once, right
after describing the change (not as a separate follow-up), that they still need to do this with the
registrar — the app change doesn't drop them from the course itself.

**"Undo that" mid-call:** if it refers to something explored but not yet committed this call, that's
just `discard_scenario`. If it refers to something already committed (earlier this call or a past
call), the only way back is `RESTORE_VERSION` to the version before it (the saved version number minus
one — `get_student_overview` gives the current number) through a fresh `run_scenario`, which still
needs its own save confirmation before `commit_scenario`. Restoring also brings back any course that
version hadn't dropped. Don't treat "undo" as a shortcut around that confirmation.
