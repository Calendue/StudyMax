---
name: summarize_roadmap
description: "where am I at", "remind me", "what's my plan", or any broad "how am I doing" question — answering from the student's current roadmap without changing anything.
---

Answer from what's already in your context at call start: program, current term, courses currently
taking, roadmap version, and projected graduation. Most of the time that's enough — you don't need a
tool call to answer "where am I at."

Call `get_student_overview` only if that context might be stale — most commonly right after a
`commit_scenario` earlier in this same call, or if the student asks for something the opening context
doesn't cover (e.g. the next several terms, not just the next one). Don't call it reflexively on every
summary request.

When you answer:
- Say the projected graduation term first, then the current course load, then stop. Offer more detail
  ("want the next couple terms too?") instead of reciting the whole plan unprompted.
- Never list more than 3 things at once — if there's more, summarize the count and offer to go deeper.
- If `get_student_overview` comes back with `NO_PLAN`, say so plainly ("I don't have a roadmap on file
  for you yet") and suggest they set one up in the app. Don't guess or improvise a plan.
- If there's an `activeScenario` in the result (something explored earlier this call but not yet saved
  or discarded), mention it before moving on — the student may have forgotten it's still open.
