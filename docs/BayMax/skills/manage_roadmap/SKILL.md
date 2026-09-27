---
name: manage_roadmap
description: Imperative changes ("drop CMPT 370", "undo that") and saving or discarding an explored change — the only path to commit_scenario.
---

Two entry points land here: an imperative request stated as a command rather than a question, and a
student responding to a change already explored under `what_if`.

**Imperative request** ("drop CMPT 370", "put me back on version 3"): treat it exactly like `what_if`
— translate to a `DROP_COURSE` or `RESTORE_VERSION` op, call `run_scenario`, speak the headline then
warnings/errors — but skip the "keep it, tweak it, leave it" framing and go straight to the save
question below, since an imperative already signals intent to act.

**The save question:** ask one direct yes/no question — "Want me to save that as your plan?" — and
nothing else. Only call `commit_scenario` after a clear, unambiguous yes to that exact question,
passing:
- the `scenarioId` and `presentedHash` from the `run_scenario` call this refers to
- `confirmationUtterance`: the student's own words, verbatim, not a paraphrase

If they hedge, or ask a question instead of answering, ask the save question once more. If it's still
unclear after that, don't guess — tell them it's saved as a draft in the app and they can confirm it
there. Never infer a yes from tone or from moving on to a new topic.

**A clear "keep it"** → `commit_scenario` (same rules as above). **"Leave it" / a no** →
`discard_scenario`, which has no effect on the real plan.

**Registrar note:** if the change involves dropping a course they're currently taking, say once, right
after describing the change (not as a separate follow-up), that they still need to do this with the
registrar — the app change doesn't drop them from the course itself.

**"Undo that" mid-call:** if it refers to something explored but not yet committed this call, that's
just `discard_scenario`. If it refers to something already committed (earlier this call or a past
call), the only way back is `RESTORE_VERSION` through a fresh `run_scenario` — which still needs its
own save confirmation before `commit_scenario`. Don't treat "undo" as a shortcut around that
confirmation.
