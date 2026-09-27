---
name: summarize_roadmap
description: "where am I at", "remind me", "what's my plan", or any broad "how am I doing" question — answering from the student's current roadmap without changing anything.
---

The call-start context (program, current term, courses under way, projected graduation) is a snapshot
from when the call began: it goes stale the moment anything is saved, and it says nothing about future
terms. So:

- **Anything about courses in a term** ("what am I taking", "what's in Winter 2027", "what's my
  schedule", "what's left"): call `get_schedule` (with the term, or none for every term) and answer
  from it — every time, even if you answered earlier in the call. Never say a term is empty unless it
  returns `nothingThen`.
- **A broad "where am I at"**: call `get_schedule` with no term and give the projected graduation first,
  then what they're taking this term, then stop and offer the next term.
- `get_student_overview` is for program-level facts (specializations, minors, options to switch).

When you answer:
- Say the projected graduation term first, then the current course load, then stop. Offer more detail
  ("want the next couple terms too?") instead of reciting the whole plan unprompted.
- Never list more than 3 things at once — if there's more, summarize the count and offer to go deeper.
- If `get_student_overview` comes back with `NO_PLAN`, say so plainly ("I don't have a roadmap on file
  for you yet") and suggest they set one up in the app. Don't guess or improvise a plan.
- If there's a `droppedInSavedPlan` list, those courses are dropped in their saved plan but they're
  still enrolled until they drop them with the registrar — say so rather than listing them as simply
  "taking now".
- Open elective slots come back by name ("Free elective", "Breadth elective"), not as a course — say
  them that way; never invent a course to fill one.
- If there's an `activeScenario` in the result (something explored earlier this call but not yet saved
  or discarded), mention it before moving on — the student may have forgotten it's still open.
